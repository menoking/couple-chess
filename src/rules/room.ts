import type { GameMode } from '../types';
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
function sealBid(state: RoomSnapshot, seat: Seat, amount: number): RoomSnapshot {
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

  if (confirmed[0] && confirmed[1]) {
    const a = data[seatScopedKey(SEALED_BID_KEY, 0)];
    const b = data[seatScopedKey(SEALED_BID_KEY, 1)];
    if (typeof a === 'number' && typeof b === 'number') {
      const winner = a === b ? null : a > b ? 0 : 1;
      data[AUCTION_REVEAL_KEY] = { bids: [a, b], winner };
      if (winner !== null) {
        const coinsRaw = data['AuctionModeView.coins'];
        const coins: Record<number, number> = coinsRaw && typeof coinsRaw === 'object'
          ? { ...(coinsRaw as Record<number, number>) }
          : { 0: 100, 1: 100 };
        const paid = winner === 0 ? a : b;
        coins[winner] = Math.max(0, (coins[winner] ?? 0) - paid);
        data['AuctionModeView.coins'] = coins;
      }
    }
  }
  return { ...state, data };
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
  const a = data[sealedKey(0)] as { round: number; value: unknown } | undefined;
  const b = data[sealedKey(1)] as { round: number; value: unknown } | undefined;
  if (a?.round === round && b?.round === round) {
    data[revealedKey] = { round, values: [a.value, b.value] };
  }
  return { ...state, data };
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
    data: {}
  };
}

/**
 * 全项目唯一的对局 reducer。24 个玩法共用：
 * 局部状态 patch、回合、抽卡四阶段、卡包大厅，全部按 seq 顺序由房主裁决。
 */
export function reduceRoom(state: RoomSnapshot, action: RoomAction): RoomSnapshot {
  const bump = (next: RoomSnapshot): RoomSnapshot => ({ ...next, seq: state.seq + 1 });

  switch (action.type) {
    case 'replace':
      return action.snapshot;

    case 'patch': {
      // 计时状态只允许权威端推进，否则两台设备的秒数会互相覆盖
      if (isAuthorityOnlyState(action.key) && action.seat !== state.hostSeat) return state;
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
          reason: found.reason,
          card: found.card,
          moveDelta: found.moveDelta
        }));
      }
      // 视图用 runId 重挂内层组件重开一局；清空全部玩法局部状态，两端一起重开
      const data = isRestartState(action.key)
        ? { [action.key]: action.value }
        : { ...state.data, [action.key]: action.value };
      // 开局确认和 turn 必须原子落地：只写 started 不写 turn 的话，
      // 另一端仍按旧回合判断，赢了先手反而无法操作。
      if (turnPrefix && startConfirmTurn !== null) {
        data[`${turnPrefix}turn`] = startConfirmTurn;
      }
      return bump({ ...state, data });
    }

    case 'patchBatch': {
      // 按顺序逐条应用，每条都走和单个 patch 完全相同的校验
      let next = state;
      for (const entry of action.entries) {
        next = reduceRoom(next, {
          type: 'patch',
          key: entry.key,
          value: entry.value,
          baseSeq: action.baseSeq,
          seat: action.seat
        });
      }
      return next;
    }

    case 'sealSubmit': {
      const next = sealSubmit(state, action.scope, action.seat, action.round, action.value);
      return next === state ? state : bump(next);
    }

    case 'sealBid': {
      const next = sealBid(state, action.seat, action.amount);
      return next === state ? state : bump(next);
    }

    case 'endTurn':
      return bump({ ...state, turn: state.turn === 0 ? 1 : 0 });

    case 'setTurn':
      return bump({ ...state, turn: action.turn === 1 ? 1 : 0 });

    case 'enqueueCard':
      return bump(enqueueCard(state, {
        drawerSeat: action.drawerSeat,
        executorSeat: action.executorSeat,
        reason: action.reason,
        card: action.card,
        moveDelta: action.moveDelta
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
      if (cleared.cards.length === 0 && state.mode === 'mine') {
        return { ...cleared, turn: cleared.turn === 0 ? 1 : 0 };
      }
      return cleared;
    }

    case 'pickThemes': {
      const picks: RoomSnapshot['picks'] = [...state.picks] as RoomSnapshot['picks'];
      picks[action.seat] = { themeIds: action.themeIds, locked: false };
      const draftPools: RoomSnapshot['draftPools'] = [...state.draftPools] as RoomSnapshot['draftPools'];
      draftPools[action.seat] = action.pool;
      return bump({ ...state, picks, draftPools, lobbyLocked: false });
    }

    case 'lockLobby': {
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
      const picks: RoomSnapshot['picks'] = [...state.picks] as RoomSnapshot['picks'];
      picks[action.seat] = { ...picks[action.seat], locked: false };
      return bump({ ...state, picks, lobbyLocked: false });
    }

    // 对方还没上线时，允许本设备用自己的卡包先开局
    case 'forceLobby': {
      const picks: RoomSnapshot['picks'] = [
        { ...state.picks[0], locked: true },
        { ...state.picks[1], locked: true }
      ];
      return bump({ ...state, picks, cardPool: mergePools(action.pool, []), lobbyLocked: true });
    }

    case 'restart':
      return bump({ ...state, data: {}, cards: [], turn: state.hostSeat });

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
