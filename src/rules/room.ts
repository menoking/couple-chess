import type { GameMode } from '../types';
import type { RoomAction, RoomSnapshot, Role, Seat } from './types';
import { enqueueCard, extractCard, projectCards, reduceCard } from './cards';
import { bothLocked, mergePools } from './lobby';
import { isAuthorityOnlyState, isRestartState, privateKeyOf } from './registry';

const emptyPick = () => ({ themeIds: [], locked: false });

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
      // 统一抽卡入口：任何玩法视图想弹自己的任务卡，都改写成公共四阶段卡片
      const found = extractCard(action.value);
      if (found) {
        return bump(enqueueCard(state, {
          drawerSeat: found.drawerSeat,
          executorSeat: found.executorSeat,
          reason: found.reason,
          card: found.card
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
        reason: action.reason
      }));

    case 'drawCard':
    case 'revealCard':
    case 'ackCard': {
      const next = reduceCard(state, action);
      return next === state ? state : bump(next);
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
