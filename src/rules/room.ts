import type { GameMode } from '../types';
import type { RoomAction, RoomSnapshot, Role, Seat } from './types';
import { enqueueCard, extractCard, projectCards, reduceCard } from './cards';
import { bothLocked, mergePools } from './lobby';
import { isAuthorityOnlyState, isRestartState, privateKeyOf, turnBoundPrefixOf } from './registry';

const emptyPick = () => ({ themeIds: [], locked: false });

/** 严格轮流玩法当前的回合方；没有内部 turn 时回落到房间回合。 */
function viewTurnOf(state: RoomSnapshot, prefix: string): number {
  const value = state.data[`${prefix}turn`];
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  return state.turn === 1 ? 1 : 0;
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
      if (turnPrefix) {
        const started = isGameStarted(state, turnPrefix);
        const owner = viewTurnOf(state, turnPrefix);
        // 首次写入某个键 = 写初值（只有权威端会做），一律放行；
        // 否则对局中连房主自己的初始化都会被「不是我的回合」拒掉。
        const isInitialWrite = !(action.key in state.data);
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
