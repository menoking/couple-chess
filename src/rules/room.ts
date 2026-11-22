import type { GameMode, MineTile } from '../types';
import { MINE_TASK_PROGRESS_TARGET, revealMineBoard, toggleMineFlag } from '../utils/gameLogic';
import type { RoomAction, RoomSnapshot, Role, Seat } from './types';
import { enqueueCard, extractCard, projectCards, reduceCard } from './cards';
import { bothLocked, mergePools } from './lobby';
import { isAuthorityOnlyState, isRestartState, privateKeyOf, seatScopedKey, turnBoundPrefixOf } from './registry';

const emptyPick = () => ({ themeIds: [], locked: false });

/** 严格轮流玩法当前的回合方；没有内部 turn 时回落到房间回合。 */
function viewTurnOf(state: RoomSnapshot, prefix: string): number {
  const value = state.data[`${prefix}turn`];
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  return state.turn === 1 ? 1 : 0;
}

/**
 * 抽卡内部键：待抽队列与待弹卡片只是视图的实现细节，最终都会由 extractCard
 * 转成公共卡，不涉及「谁有权操作」。
 *
 * 关键：它们经常在回合已经交给对方之后才被清空——比如斗兽棋吃完子先把 turn 翻给
 * 对方，下一帧才把队列里的卡弹出来并清空队列。如果这两个键也受回合校验，
 * `cardQueue = []` 会被判越权丢掉，队列永远清不空，effect 又会反复重新消费、
 * 反复入队，表现就是「一直卡在翻卡，怎么也关不掉」。
 */
const CARD_INTERNAL_SUFFIXES = ['.cardQueue', '.taskData'];

function isCardInternalKey(key: string): boolean {
  return CARD_INTERNAL_SUFFIXES.some(suffix => key.endsWith(suffix));
}

/**
 * 是否已经真正开始对局。
 * 只认显式的 started / phase 标记；都没有时视为**未开局**——
 * 早期版本用「出现 turn 以外的键就算开局」兜底，会把组件挂载时写的初值
 * 误判成对局中，导致女方赢先手时 started / turn 的写入被拒、永远进不去游戏。
 */
function isGameStarted(state: RoomSnapshot, prefix: string): boolean {
  const started = state.data[`${prefix}started`];
  if (typeof started === 'boolean') return started;
  const phase = state.data[`${prefix}phase`];
  if (typeof phase === 'string') return phase === 'play' || phase === 'over';
  return false;
}

/**
 * 开局确认键：写它的人就是先手。
 * 必须在同一次 patch 里把 turn 一起落下去，否则「先写 started 再写 turn」
 * 会被回合校验判定为越权（此时 owner 还是上一方），表现就是女方赢了先手却卡在掷骰页。
 */
function isStartConfirmAction(key: string, prefix: string, value: unknown): boolean {
  if (key === `${prefix}started`) return value === true;
  if (key === `${prefix}phase`) return value === 'play';
  return false;
}

const SEALED_BID_KEY = 'AuctionModeView.sealedBid';
const AUCTION_REVEAL_KEY = 'AuctionModeView.revealed';
const AUCTION_CONFIRMED_KEY = 'AuctionModeView.confirmed';

/**
 * 拍卖密封出价：价格写进按座位隔离的槽位，viewFor 只会把它下发给本人，
 * 对方（包括观战视角）拿不到。双方都提交后，房主一次性算出结果写进公共字段。
 */
function sealBid(state: RoomSnapshot, seat: Seat, amount: number, round: number): RoomSnapshot {
  if (state.data['AuctionModeView.round'] !== round) return state;
  // 本轮已经揭晓就不再接受新的密封出价，避免重复结算
  if (state.data[AUCTION_REVEAL_KEY]) return state;
  const value = Math.max(0, Math.floor(amount));
  const confirmedRaw = state.data[AUCTION_CONFIRMED_KEY];
  const confirmed: [boolean, boolean] = Array.isArray(confirmedRaw)
    ? [confirmedRaw[0] === true, confirmedRaw[1] === true]
    : [false, false];
  confirmed[seat] = true;

  const data: Record<string, unknown> = {
    ...state.data,
    [seatScopedKey(SEALED_BID_KEY, seat)]: value,
    [AUCTION_CONFIRMED_KEY]: confirmed
  };
  const changedKeys = [seatScopedKey(SEALED_BID_KEY, seat), AUCTION_CONFIRMED_KEY];

  if (confirmed[0] && confirmed[1]) {
    const a = data[seatScopedKey(SEALED_BID_KEY, 0)];
    const b = data[seatScopedKey(SEALED_BID_KEY, 1)];
    if (typeof a === 'number' && typeof b === 'number') {
      const winner = a === b ? null : a > b ? 0 : 1;
      data[AUCTION_REVEAL_KEY] = { bids: [a, b], winner };
      changedKeys.push(AUCTION_REVEAL_KEY);
      if (winner !== null) {
        const coinsRaw = data['AuctionModeView.coins'];
        const coins: Record<number, number> = coinsRaw && typeof coinsRaw === 'object'
          ? { ...(coinsRaw as Record<number, number>) }
          : { 0: 100, 1: 100 };
        const paid = winner === 0 ? a : b;
        coins[winner] = Math.max(0, (coins[winner] ?? 0) - paid);
        data['AuctionModeView.coins'] = coins;
        changedKeys.push('AuctionModeView.coins');
      }
    }
  }
  const writeSeq = state.seq + 1;
  return {
    ...state,
    data,
    dataSeq: {
      ...(state.dataSeq ?? {}),
      ...Object.fromEntries(changedKeys.map(key => [key, writeSeq]))
    }
  };
}

/**
 * 通用密封提交：答案写进按座位隔离的槽位，viewFor 只下发本人那份。
 * 两个人同一轮都提交后，才把两份答案一起写进公共的 `${scope}.revealed`。
 */
function sealSubmit(
  state: RoomSnapshot,
  scope: string,
  seat: Seat,
  round: number,
  value: string | number | null
): RoomSnapshot {
  const revealedKey = `${scope}.revealed`;
  const sealedKey = (target: Seat) => seatScopedKey(`${scope}.sealed`, target);
  const current = state.data[revealedKey] as { round?: number } | undefined;
  // 同一轮已经揭晓就不再接受新的提交，避免重复结算
  if (current && typeof current.round === 'number' && current.round >= round) return state;

  const data: Record<string, unknown> = {
    ...state.data,
    [sealedKey(seat)]: { round, value }
  };
  const changedKeys = [sealedKey(seat)];
  const a = data[sealedKey(0)] as { round: number; value: unknown } | undefined;
  const b = data[sealedKey(1)] as { round: number; value: unknown } | undefined;
  if (a?.round === round && b?.round === round) {
    data[revealedKey] = { round, values: [a.value, b.value] };
    changedKeys.push(revealedKey);
  }
  const writeSeq = state.seq + 1;
  return {
    ...state,
    data,
    dataSeq: {
      ...(state.dataSeq ?? {}),
      ...Object.fromEntries(changedKeys.map(key => [key, writeSeq]))
    }
  };
}

export function createRoom(
  mode: GameMode,
  roles: [Role, Role],
  hostSeat: Seat,
  firstTurn: number = hostSeat
): RoomSnapshot {
  return {
    seq: 0,
    mode,
    turn: firstTurn === 1 ? 1 : 0,
    roles,
    hostSeat,
    cardPool: [],
    draftPools: [[], []],
    picks: [emptyPick(), emptyPick()],
    lobbyLocked: false,
    cards: [],
    cardSeq: 0,
    data: {},
    dataSeq: {},
    dataResetSeq: 0
  };
}

/**
 * 全项目唯一的对局 reducer。24 个玩法共用：
 * 局部状态 patch、回合、抽卡四阶段、卡包大厅，全部按 seq 顺序由房主裁决。
 */
export function reduceRoom(state: RoomSnapshot, action: RoomAction): RoomSnapshot {
  const bump = (next: RoomSnapshot): RoomSnapshot => ({ ...next, seq: state.seq + 1 });

  const patchConflicts = (key: string, baseSeq: number): boolean =>
    baseSeq < (state.dataResetSeq ?? 0) || (state.dataSeq?.[key] ?? 0) > baseSeq;

  const validatePatch = (key: string, value: unknown, seat: Seat): boolean => {
    if (isAuthorityOnlyState(key) && seat !== state.hostSeat) return false;
    const turnPrefix = turnBoundPrefixOf(key);
    if (!turnPrefix || isCardInternalKey(key)) return true;
    const started = isGameStarted(state, turnPrefix);
    const owner = viewTurnOf(state, turnPrefix);
    const isInitialWrite = !(key in state.data) && seat === state.hostSeat;
    return !started || isInitialWrite || value === null || seat === owner;
  };

  switch (action.type) {
    case 'replace':
      return action.snapshot;

    case 'patch': {
      if (patchConflicts(action.key, action.baseSeq)) return state;
      // 计时状态只允许权威端推进，否则两台设备的秒数会互相覆盖
      if (!validatePatch(action.key, action.value, action.seat)) return state;
      // 严格轮流玩法：非当前回合方不能写玩法状态。
      // 前端守卫（useMyTurn）会因为座位 / Presence 竞态失效，这里是最终裁决——
      // 只要写的人不是当前回合方，房主直接丢弃，绝不让两端各走各的。
      const turnPrefix = turnBoundPrefixOf(action.key);
      let startConfirmTurn: number | null = null;
      // 抽卡内部键不参与回合裁决，见 isCardInternalKey 的说明
      if (turnPrefix && !isCardInternalKey(action.key)) {
        const started = isGameStarted(state, turnPrefix);
        const owner = viewTurnOf(state, turnPrefix);
        // 首次写入某个键 = 房主写初值，一律放行；否则对局中连房主自己的初始化
        // 都会被「不是我的回合」拒掉。限定 hostSeat，避免对方抢先初始化一个空键。
        const isInitialWrite = !(action.key in state.data) && action.seat === state.hostSeat;
        // 开局阶段（还没有 started / phase）也一律放行：此时没有回合概念，
        // 定先手的 turn 与 started 可能由任何一方写，顺序也不保证。
        if (started && !isInitialWrite && action.value !== null && action.seat !== owner) {
          return state;
        }
        // 未开局时按下「确认先手」的人就是先手，和 turn 一起原子落地
        if (!started && isStartConfirmAction(action.key, turnPrefix, action.value)) {
          startConfirmTurn = action.seat;
        }
      }
      // 统一抽卡入口：任何玩法视图想弹自己的任务卡，都改写成公共四阶段卡片
      const found = extractCard(action.value);
      if (found) {
        // 两端会同时执行同一段「自动弹卡」逻辑，队首已经是同一张就不要再入队
        const head = state.cards[0];
        if (head && head.executorSeat === found.executorSeat && head.card?.task === found.card.task) {
          return state;
        }
        return bump(enqueueCard(state, {
          drawerSeat: found.drawerSeat,
          executorSeat: found.executorSeat,
          executionMode: found.executionMode,
          targetSeat: found.targetSeat,
          reason: found.reason,
          card: found.card,
          moveDelta: found.moveDelta,
          continuation: found.continuation
        }));
      }
      // 视图用 runId 重挂内层组件重开一局；清空全部玩法局部状态，两端一起重开
      const resetting = isRestartState(action.key);
      const data = resetting
        ? { [action.key]: action.value }
        : { ...state.data, [action.key]: action.value };
      // 开局确认和 turn 必须原子落地：只写 started 不写 turn 的话，
      // 另一端仍按旧回合判断，赢了先手反而无法操作。
      if (turnPrefix && startConfirmTurn !== null) {
        data[`${turnPrefix}turn`] = startConfirmTurn;
      }
      const writeSeq = state.seq + 1;
      const dataSeq: Record<string, number> = resetting
        ? { [action.key]: writeSeq }
        : { ...(state.dataSeq ?? {}), [action.key]: writeSeq };
      if (turnPrefix && startConfirmTurn !== null) dataSeq[`${turnPrefix}turn`] = writeSeq;
      return bump({ ...state, data, dataSeq, dataResetSeq: resetting ? writeSeq : state.dataResetSeq });
    }

    case 'patchBatch': {
      if (action.entries.length === 0) return state;
      const keys = new Set<string>();
      for (const entry of action.entries) {
        if (keys.has(entry.key) || patchConflicts(entry.key, action.baseSeq) || !validatePatch(entry.key, entry.value, action.seat)) {
          return state;
        }
        keys.add(entry.key);
      }
      if (action.entries.some(entry => isRestartState(entry.key))) return state;
      const cardEntries = action.entries
        .map(entry => ({ entry, found: extractCard(entry.value) }))
        .filter(item => item.found !== null);
      if (cardEntries.length > 1) return state;
      const data = { ...state.data };
      let startTurn: { prefix: string; seat: Seat } | null = null;
      for (const entry of action.entries) {
        if (extractCard(entry.value)) continue;
        data[entry.key] = entry.value;
        const prefix = turnBoundPrefixOf(entry.key);
        if (prefix && !isGameStarted(state, prefix) && isStartConfirmAction(entry.key, prefix, entry.value)) {
          startTurn = { prefix, seat: action.seat };
        }
      }
      if (startTurn) data[`${startTurn.prefix}turn`] = startTurn.seat;
      const writeSeq = state.seq + 1;
      const dataSeq = { ...(state.dataSeq ?? {}) };
      action.entries.forEach(entry => {
        if (!extractCard(entry.value)) dataSeq[entry.key] = writeSeq;
      });
      if (startTurn) dataSeq[`${startTurn.prefix}turn`] = writeSeq;
      let next: RoomSnapshot = { ...state, data, dataSeq };
      const found = cardEntries[0]?.found;
      if (found) {
        const head = state.cards[0];
        if (!head || head.executorSeat !== found.executorSeat || head.card?.task !== found.card.task) {
          next = enqueueCard(next, {
            drawerSeat: found.drawerSeat,
            executorSeat: found.executorSeat,
            executionMode: found.executionMode,
            targetSeat: found.targetSeat,
            reason: found.reason,
            card: found.card,
            moveDelta: found.moveDelta,
            continuation: found.continuation
          });
        }
      }
      return bump(next);
    }

    case 'sealSubmit': {
      const next = sealSubmit(state, action.scope, action.seat, action.round, action.value);
      return next === state ? state : bump(next);
    }

    case 'sealBid': {
      const next = sealBid(state, action.seat, action.amount, action.round);
      return next === state ? state : bump(next);
    }

    case 'bluffChallenge': {
      if (state.mode !== 'bluff') return state;
      const round = state.data['BluffDiceModeView.round'];
      const turn = state.data['BluffDiceModeView.turn'];
      const phase = state.data['BluffDiceModeView.phase'];
      const bid = state.data['BluffDiceModeView.bid'] as { qty?: number; face?: number; by?: number } | null;
      if (round !== action.round || turn !== action.seat || phase !== 'bid' || !bid) return state;
      const hand0 = state.data[seatScopedKey('BluffDiceModeView.dice', 0)];
      const hand1 = state.data[seatScopedKey('BluffDiceModeView.dice', 1)];
      if (!Array.isArray(hand0) || !Array.isArray(hand1) || hand0.length !== 5 || hand1.length !== 5) return state;
      if (typeof bid.qty !== 'number' || typeof bid.face !== 'number' || (bid.by !== 0 && bid.by !== 1)) return state;

      const count = [...hand0, ...hand1].filter(value => value === bid.face).length;
      const bidderWins = count >= bid.qty;
      const loserId = bidderWins ? action.seat : bid.by;
      const winnerId = bidderWins ? bid.by : action.seat;
      const pointsRaw = state.data['BluffDiceModeView.points'];
      const points = pointsRaw && typeof pointsRaw === 'object'
        ? { ...(pointsRaw as Record<number, number>) }
        : { 0: 0, 1: 0 };
      points[winnerId] = (points[winnerId] ?? 0) + 1;
      const writeSeq = state.seq + 1;
      const changed = ['BluffDiceModeView.points', 'BluffDiceModeView.reveal', 'BluffDiceModeView.phase'];
      const dataSeq = { ...(state.dataSeq ?? {}) };
      changed.forEach(key => { dataSeq[key] = writeSeq; });
      return bump({
        ...state,
        data: {
          ...state.data,
          'BluffDiceModeView.points': points,
          'BluffDiceModeView.reveal': { count, bidderWins, loserId, winnerId, dice: [hand0, hand1] },
          'BluffDiceModeView.phase': 'reveal'
        },
        dataSeq
      });
    }

    case 'bluffReady': {
      if (state.mode !== 'bluff' || state.data['BluffDiceModeView.round'] !== action.round) return state;
      if (action.dice.length !== 5 || action.dice.some(value => !Number.isInteger(value) || value < 1 || value > 6)) return state;
      const readyRaw = state.data['BluffDiceModeView.ready'];
      const ready: [boolean, boolean] = Array.isArray(readyRaw)
        ? [readyRaw[0] === true, readyRaw[1] === true]
        : [false, false];
      if (ready[action.seat]) return state;
      ready[action.seat] = true;
      const diceKey = seatScopedKey('BluffDiceModeView.dice', action.seat);
      const writeSeq = state.seq + 1;
      const dataSeq = {
        ...(state.dataSeq ?? {}),
        [diceKey]: writeSeq,
        'BluffDiceModeView.ready': writeSeq,
        ...(ready[0] && ready[1] ? { 'BluffDiceModeView.phase': writeSeq } : {})
      };
      return bump({
        ...state,
        data: {
          ...state.data,
          [diceKey]: [...action.dice],
          'BluffDiceModeView.ready': ready,
          ...(ready[0] && ready[1] ? { 'BluffDiceModeView.phase': 'bid' } : {})
        },
        dataSeq
      });
    }

    case 'bluffNextRound': {
      if (state.mode !== 'bluff' || state.data['BluffDiceModeView.round'] !== action.round) return state;
      if (state.data['BluffDiceModeView.phase'] !== 'reveal' || state.data['BluffDiceModeView.turn'] !== action.seat) return state;
      const nextRound = action.round + 1;
      const data = {
        ...state.data,
        'BluffDiceModeView.round': nextRound,
        'BluffDiceModeView.starterId': action.nextStarter,
        'BluffDiceModeView.turn': action.nextStarter,
        'BluffDiceModeView.phase': 'handoff1',
        'BluffDiceModeView.bid': null,
        'BluffDiceModeView.reveal': null,
        'BluffDiceModeView.taskData': null,
        'BluffDiceModeView.ready': [false, false],
        [seatScopedKey('BluffDiceModeView.dice', 0)]: null,
        [seatScopedKey('BluffDiceModeView.dice', 1)]: null
      };
      const writeSeq = state.seq + 1;
      const changed = [
        'BluffDiceModeView.round', 'BluffDiceModeView.starterId', 'BluffDiceModeView.turn',
        'BluffDiceModeView.phase', 'BluffDiceModeView.bid', 'BluffDiceModeView.reveal',
        'BluffDiceModeView.taskData', 'BluffDiceModeView.ready',
        seatScopedKey('BluffDiceModeView.dice', 0), seatScopedKey('BluffDiceModeView.dice', 1)
      ];
      const dataSeq = { ...(state.dataSeq ?? {}) };
      changed.forEach(key => { dataSeq[key] = writeSeq; });
      return bump({ ...state, data, dataSeq });
    }

    case 'endTurn':
      if (action.expectedTurn !== state.turn || action.seat !== state.turn) return state;
      return bump({ ...state, turn: state.turn === 0 ? 1 : 0 });

    case 'setTurn':
      return bump({ ...state, turn: action.turn === 1 ? 1 : 0 });

    case 'mineReveal': {
      if (state.mode !== 'mine' || state.cards.length > 0) return state;
      if (state.turn !== action.expectedTurn || action.seat !== state.turn) return state;
      if (state.data['stage.mineEvent']) return state;
      const board = state.data['stage.mineBoard'];
      if (!Array.isArray(board)) return state;
      const result = revealMineBoard(board as MineTile[], action.index, action.seat);
      if (!result) return state;
      const nextSeq = state.seq + 1;
      const rawProgress = state.data['stage.mineProgress'];
      const progress: [number, number] = Array.isArray(rawProgress)
        ? [Number(rawProgress[0]) || 0, Number(rawProgress[1]) || 0]
        : [0, 0];
      let taskCount = typeof state.data['stage.mineTaskCount'] === 'number'
        ? Math.max(0, Math.floor(state.data['stage.mineTaskCount'] as number))
        : 0;
      let eventType: MineTile['type'] = 'blank';
      if (result.type === 'bomb') {
        progress[action.seat] = 0;
        eventType = 'bomb';
      } else {
        progress[action.seat] += 1;
        if (progress[action.seat] >= MINE_TASK_PROGRESS_TARGET) {
          progress[action.seat] = 0;
          eventType = (['truth', 'dare', 'theme'] as const)[taskCount % 3];
          taskCount += 1;
        }
      }
      return {
        ...state,
        seq: nextSeq,
        data: {
          ...state.data,
          'stage.mineBoard': result.board,
          'stage.mineProgress': progress,
          'stage.mineTaskCount': taskCount,
          'stage.mineEvent': {
            id: nextSeq,
            seat: action.seat,
            type: eventType,
            completed: result.completed
          }
        },
        dataSeq: {
          ...state.dataSeq,
          'stage.mineBoard': nextSeq,
          'stage.mineProgress': nextSeq,
          'stage.mineTaskCount': nextSeq,
          'stage.mineEvent': nextSeq
        }
      };
    }

    case 'mineToggleFlag': {
      if (state.mode !== 'mine' || state.cards.length > 0) return state;
      if (state.turn !== action.expectedTurn || action.seat !== state.turn) return state;
      if (state.data['stage.mineEvent']) return state;
      const board = state.data['stage.mineBoard'];
      if (!Array.isArray(board)) return state;
      const nextBoard = toggleMineFlag(board as MineTile[], action.index, action.seat);
      if (!nextBoard) return state;
      const nextSeq = state.seq + 1;
      return {
        ...state,
        seq: nextSeq,
        data: { ...state.data, 'stage.mineBoard': nextBoard },
        dataSeq: { ...state.dataSeq, 'stage.mineBoard': nextSeq }
      };
    }

    case 'mineFinishEvent': {
      if (state.mode !== 'mine' || state.cards.length > 0) return state;
      const event = state.data['stage.mineEvent'] as { id?: number; seat?: Seat; type?: string; completed?: boolean } | undefined;
      if (!event || event.id !== action.eventId) return state;
      const allowed = action.seat === state.hostSeat || (event.type === 'bomb' && action.seat !== event.seat);
      if (!allowed) return state;
      const nextSeq = state.seq + 1;
      return {
        ...state,
        seq: nextSeq,
        turn: event.completed ? state.turn : state.turn === 0 ? 1 : 0,
        data: { ...state.data, 'stage.mineEvent': null },
        dataSeq: { ...state.dataSeq, 'stage.mineEvent': nextSeq }
      };
    }

    case 'enqueueCard':
      return bump(enqueueCard(state, {
        drawerSeat: action.drawerSeat,
        executorSeat: action.executorSeat,
        executionMode: action.executionMode,
        targetSeat: action.targetSeat,
        reason: action.reason,
        card: action.card,
        moveDelta: action.moveDelta,
        continuation: action.continuation
      }));

    case 'drawCard':
    case 'revealCard':
    case 'ackCard':
    case 'forceCloseCard': {
      const next = reduceCard(state, action);
      if (next === state) return state;
      const cleared = bump(next);
      // 扫雷：任务卡/炸弹卡确认完就是一次回合，由房主统一交回合，
      // 避免 blank / task / bomb 三条分支各写一次 endTurn 还容易漏
      if (cleared.cards.length === 0 && state.mode === 'mine' && !state.cards[0]?.continuation) {
        const event = state.data['stage.mineEvent'] as { completed?: boolean } | undefined;
        const nextSeq = cleared.seq;
        return {
          ...cleared,
          turn: event?.completed ? cleared.turn : cleared.turn === 0 ? 1 : 0,
          data: { ...cleared.data, 'stage.mineEvent': null },
          dataSeq: { ...cleared.dataSeq, 'stage.mineEvent': nextSeq }
        };
      }
      return cleared;
    }

    case 'pickThemes': {
      if (state.lobbyLocked || state.picks[action.seat].locked) return state;
      const picks: RoomSnapshot['picks'] = [...state.picks] as RoomSnapshot['picks'];
      picks[action.seat] = { themeIds: action.themeIds, locked: false };
      const draftPools: RoomSnapshot['draftPools'] = [...state.draftPools] as RoomSnapshot['draftPools'];
      draftPools[action.seat] = action.pool;
      return bump({ ...state, picks, draftPools, lobbyLocked: false });
    }

    case 'lockLobby': {
      if (state.lobbyLocked || state.picks[action.seat].locked) return state;
      const picks: RoomSnapshot['picks'] = [...state.picks] as RoomSnapshot['picks'];
      picks[action.seat] = { themeIds: action.themeIds, locked: true };
      const draftPools: RoomSnapshot['draftPools'] = [...state.draftPools] as RoomSnapshot['draftPools'];
      draftPools[action.seat] = action.pool;
      const next: RoomSnapshot = { ...state, picks, draftPools };
      if (bothLocked(next)) {
        return bump({ ...next, cardPool: mergePools(next.draftPools[0], next.draftPools[1]), lobbyLocked: true });
      }
      return bump({ ...next, lobbyLocked: false });
    }

    case 'unlockLobby': {
      if (state.lobbyLocked || !state.picks[action.seat].locked) return state;
      const picks: RoomSnapshot['picks'] = [...state.picks] as RoomSnapshot['picks'];
      picks[action.seat] = { ...picks[action.seat], locked: false };
      return bump({ ...state, picks, lobbyLocked: false });
    }

    // 对方还没上线时，允许本设备用自己的卡包先开局
    case 'forceLobby': {
      if (state.lobbyLocked) return state;
      const picks: RoomSnapshot['picks'] = [
        { ...state.picks[0], locked: true },
        { ...state.picks[1], locked: true }
      ];
      // 免卡包玩法（故事接龙 / 问答 / 剧本 / 转盘 / 姿势）传空池，
      // 不要塞兜底卡：这些玩法根本不读公共题库。
      const pool = action.pool.length > 0 ? mergePools(action.pool, []) : [];
      return bump({ ...state, picks, cardPool: pool, lobbyLocked: true });
    }

    case 'restart':
      return bump({ ...state, data: {}, dataSeq: {}, dataResetSeq: state.seq + 1, cards: [], turn: state.hostSeat });

    default:
      return state;
  }
}

/**
 * 按座位下发视图：
 * - 卡面按四阶段裁剪（败方在胜方抽卡前拿不到任何明文）
 * - 座位私有状态（如各自的骰子）只发给本人
 * - 公共题库只留在权威端，访客不需要也无法预知抽到的卡
 */
export function viewFor(state: RoomSnapshot, seat: Seat): RoomSnapshot {
  const data: Record<string, unknown> = {};
  Object.entries(state.data).forEach(([key, value]) => {
    const owner = privateKeyOf(key);
    if (owner !== null && owner !== seat) return;
    data[key] = value;
  });
  return {
    ...state,
    cards: projectCards(state, seat),
    data,
    // 公共题库双方都要读（各自选包合并而来，本身不是秘密）；
    // 具体抽到哪张由四阶段 CardGate 控制，题库公开不会泄露卡面。
    cardPool: state.cardPool,
    draftPools: state.draftPools
  };
}
