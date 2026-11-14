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
 * 是否已经真正开始对局。开局阶段（掷骰定先手）任何一方都能写 turn，
 * 对局中只有当前回合方能翻 turn——否则对方可以改 turn 抢回合。
 */
function isGameStarted(state: RoomSnapshot, prefix: string): boolean {
  const started = state.data[`${prefix}started`];
  if (typeof started === 'boolean') return started;
  const phase = state.data[`${prefix}phase`];
  if (typeof phase === 'string') return phase === 'play' || phase === 'over';
  // 没有显式阶段标记：出现 turn 以外的玩法状态就算已开局
  return Object.keys(state.data).some(
    key => key.startsWith(prefix) && key !== `${prefix}turn`
  );
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
      if (turnPrefix) {
        const isTurnKey = action.key === `${turnPrefix}turn`;
        if (isTurnKey) {
          // 开局定先手：赢家写 turn，此时还没有对局状态，放行。
          // 对局中翻 turn 必须由当前回合方发起，堵住「对方改 turn 抢回合」。
          if (isGameStarted(state, turnPrefix) && action.seat !== viewTurnOf(state, turnPrefix)) {
            return state;
          }
        } else if (action.value !== null && action.seat !== viewTurnOf(state, turnPrefix)) {
          // 其它玩法状态只有当前回合方能写；null 是清理操作，放行避免卡死
          return state;
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
    case 'ackCard': {
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
