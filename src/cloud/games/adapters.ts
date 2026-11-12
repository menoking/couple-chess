import { GameAdapter, OnlineCard, RoomPlayer, Seat } from '../types';
import { GoBoard, createGoBoard, playMove, scoreGoBoard } from '../../utils/go';
import {
  JungleBoard,
  applyMove as applyJungleMove,
  createJungleBoard,
  getLegalMoves
} from '../../utils/jungle';

/* ------------------------------ 抽卡队列 ------------------------------ */

/** 一张待确认的联机任务卡：抽卡人与执行人可以不是同一方。 */
export interface OnlinePendingCard {
  id: number;
  /** 抽卡的人（一般是赢的一方 / 吃子的一方） */
  drawerSeat: Seat;
  /** 执行任务的人（一般是输的一方 / 被吃子的一方） */
  executorSeat: Seat;
  reason: string;
  card: OnlineCard;
}

const FALLBACK_CARD: OnlineCard = {
  task: '请先在首页为双方选择支持「抽卡」的任务包，下一局就能抽到具体任务',
  themeName: '未选择主题'
};

/** 清洗题库；空题库时用一张说明卡兜底，保证联机时一定弹得出卡片。 */
export function normalizeCardPool(pool?: OnlineCard[]): OnlineCard[] {
  const cleaned = (pool ?? [])
    .filter(item => typeof item?.task === 'string' && item.task.trim().length > 0)
    .map(item => ({
      task: item.task.trim(),
      themeName: item.themeName?.trim() || '任务包'
    }));
  return cleaned.length > 0 ? cleaned : [FALLBACK_CARD];
}

/** 按卡序号确定性取卡：房主与访客永远看到同一张卡，不依赖各自的本地题库。 */
export function cardFor(pool: OnlineCard[], id: number): OnlineCard {
  if (pool.length === 0) return FALLBACK_CARD;
  const seed = Math.imul(id, 2654435761) >>> 0;
  return pool[seed % pool.length];
}

interface CardSpec {
  drawerSeat: Seat;
  executorSeat: Seat;
  reason: string;
}

/** 把新抽到的卡追加到队列，返回可直接展开进 state 的两个字段。 */
function enqueueCards(
  pool: OnlineCard[],
  pending: OnlinePendingCard[],
  seq: number,
  specs: CardSpec[]
): { pending: OnlinePendingCard[]; pendingSeq: number } {
  const next = [...pending];
  let nextSeq = seq;
  for (const spec of specs) {
    nextSeq += 1;
    next.push({
      id: nextSeq,
      drawerSeat: spec.drawerSeat,
      executorSeat: spec.executorSeat,
      reason: spec.reason,
      card: cardFor(pool, nextSeq)
    });
  }
  return { pending: next, pendingSeq: nextSeq };
}

/** 只有执行人能确认卡片；确认后弹出下一张。 */
function acknowledgeCards<S extends { pending: OnlinePendingCard[] }>(state: S, seat: Seat): S {
  const first = state.pending[0];
  if (!first || first.executorSeat !== seat) return state;
  return { ...state, pending: state.pending.slice(1) };
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

/* ------------------------------ 九路围棋 ------------------------------ */

const CAPTURE_PER_CARD = 3;
const GO_WINNER_CARDS = 2;

export interface GoState {
  board: GoBoard;
  turn: Seat;
  captures: [number, number];
  koKey: string | null;
  lastMove: number | null;
  passes: number;
  winner: Seat | null;
  reason: 'den' | 'capture' | 'score' | 'resign' | null;
  cardPool: OnlineCard[];
  pending: OnlinePendingCard[];
  pendingSeq: number;
}

export type GoAction =
  | { type: 'place'; index: number }
  | { type: 'pass' }
  | { type: 'resign' }
  | { type: 'ackCard' };

export const goAdapter: GameAdapter<GoState, GoAction, GoState> = {
  mode: 'go',
  label: '九路围棋',
  createInitial: (_players: RoomPlayer[], cardPool: OnlineCard[] = []) => ({
    board: createGoBoard(),
    turn: 0,
    captures: [0, 0],
    koKey: null,
    lastMove: null,
    passes: 0,
    winner: null,
    reason: null,
    cardPool: normalizeCardPool(cardPool),
    pending: [],
    pendingSeq: 0
  }),
  apply(state, action, seat) {
    if (action.type === 'ackCard') return acknowledgeCards(state, seat);
    // 卡片没确认前，双方都不能继续落子
    if (state.pending.length > 0) return state;
    if (state.winner !== null) return state;

    const terminalCards = (winner: Seat) =>
      enqueueCards(
        state.cardPool,
        state.pending,
        state.pendingSeq,
        Array.from({ length: GO_WINNER_CARDS }, () => ({
          drawerSeat: winner,
          executorSeat: other(winner),
          reason: '终局 · 胜方抽卡，败方执行'
        }))
      );

    if (action.type === 'resign') {
      const winner = other(seat);
      return { ...state, ...terminalCards(winner), winner, reason: 'resign' };
    }
    if (state.turn !== seat) return state;

    if (action.type === 'pass') {
      const passes = state.passes + 1;
      if (passes >= 2) {
        const score = scoreGoBoard(state.board);
        const winner: Seat = score.area[0] >= score.area[1] ? 0 : 1;
        return { ...state, passes, winner, reason: 'score', ...terminalCards(winner) };
      }
      return { ...state, passes, turn: other(seat), koKey: null };
    }

    const result = playMove(state.board, action.index, seat, state.koKey);
    if (!result) return state;

    const captures: [number, number] = [...state.captures] as [number, number];
    const before = captures[seat];
    captures[seat] += result.captured;
    const gained = Math.floor(captures[seat] / CAPTURE_PER_CARD) - Math.floor(before / CAPTURE_PER_CARD);

    return {
      ...state,
      board: result.board,
      koKey: result.koKey,
      lastMove: action.index,
      captures,
      passes: 0,
      turn: other(seat),
      ...enqueueCards(
        state.cardPool,
        state.pending,
        state.pendingSeq,
        Array.from({ length: Math.max(0, gained) }, () => ({
          drawerSeat: seat,
          executorSeat: other(seat),
          reason: '提子满 3 个 · 你抽卡，对方执行'
        }))
      )
    };
  },
  viewFor: state => state,
  winnerOf: state => state.winner
};

/* ------------------------------ 斗兽棋 ------------------------------ */

export interface JungleState {
  board: JungleBoard;
  turn: Seat;
  captured: [number, number];
  lastMove: { from: number; to: number } | null;
  winner: Seat | null;
  cardPool: OnlineCard[];
  pending: OnlinePendingCard[];
  pendingSeq: number;
}

export type JungleAction =
  | { type: 'move'; from: number; to: number }
  | { type: 'resign' }
  | { type: 'ackCard' };

export const jungleAdapter: GameAdapter<JungleState, JungleAction, JungleState> = {
  mode: 'jungle',
  label: '斗兽棋',
  createInitial: (_players: RoomPlayer[], cardPool: OnlineCard[] = []) => ({
    board: createJungleBoard(),
    turn: 0,
    captured: [0, 0],
    lastMove: null,
    winner: null,
    cardPool: normalizeCardPool(cardPool),
    pending: [],
    pendingSeq: 0
  }),
  apply(state, action, seat) {
    if (action.type === 'ackCard') return acknowledgeCards(state, seat);
    if (state.pending.length > 0) return state;
    if (state.winner !== null) return state;

    const terminalCards = (winner: Seat) =>
      enqueueCards(state.cardPool, state.pending, state.pendingSeq, [
        { drawerSeat: winner, executorSeat: other(winner), reason: '终局 · 胜方抽卡，败方执行' }
      ]);

    if (action.type === 'resign') {
      const winner = other(seat);
      return { ...state, ...terminalCards(winner), winner };
    }
    if (state.turn !== seat) return state;
    if (!getLegalMoves(state.board, action.from).includes(action.to)) return state;

    const result = applyJungleMove(state.board, action.from, action.to);
    if (!result) return state;

    const captured: [number, number] = [...state.captured] as [number, number];
    if (result.captured) captured[seat] += 1;

    const specs: CardSpec[] = [];
    if (result.captured) {
      specs.push({
        drawerSeat: seat,
        executorSeat: other(seat),
        reason: `吃掉对方一子 · 你抽卡，对方执行`
      });
    }
    if (result.winner !== null) {
      const winner = result.winner as Seat;
      specs.push({
        drawerSeat: winner,
        executorSeat: other(winner),
        reason: '终局 · 胜方抽卡，败方执行'
      });
    }

    return {
      ...state,
      board: result.board,
      captured,
      lastMove: { from: action.from, to: action.to },
      turn: other(seat),
      winner: result.winner !== null ? (result.winner as Seat) : null,
      ...enqueueCards(state.cardPool, state.pending, state.pendingSeq, specs)
    };
  },
  viewFor: state => state,
  winnerOf: state => state.winner
};

/* ------------------------------ 吹牛骰 ------------------------------ */

const DICE_EACH = 5;
const TOTAL_DICE = DICE_EACH * 2;

function rollDice(): number[] {
  return Array.from({ length: DICE_EACH }, () => Math.floor(Math.random() * 6) + 1);
}

export interface BluffBid {
  qty: number;
  face: number;
  by: Seat;
}

export interface BluffState {
  dice: [number[], number[]];
  turn: Seat;
  bid: BluffBid | null;
  phase: 'bid' | 'reveal';
  round: number;
  starter: Seat;
  scores: [number, number];
  reveal: { count: number; loser: Seat; winner: Seat } | null;
  cardPool: OnlineCard[];
  pending: OnlinePendingCard[];
  pendingSeq: number;
}

export type BluffAction =
  | { type: 'bid'; qty: number; face: number }
  | { type: 'challenge' }
  | { type: 'next' }
  | { type: 'ackCard' };

export interface BluffView {
  phase: 'bid' | 'reveal';
  turn: Seat;
  bid: BluffBid | null;
  round: number;
  scores: [number, number];
  myDice: number[] | null;
  oppDice: number[] | null;
  oppDiceCount: number;
  reveal: { count: number; loser: Seat; winner: Seat } | null;
  pending: OnlinePendingCard[];
}

export const bluffAdapter: GameAdapter<BluffState, BluffAction, BluffView> = {
  mode: 'bluff',
  label: '吹牛骰',
  createInitial: (_players: RoomPlayer[], cardPool: OnlineCard[] = []) => ({
    dice: [rollDice(), rollDice()],
    turn: 0,
    bid: null,
    phase: 'bid',
    round: 1,
    starter: 0,
    scores: [0, 0],
    reveal: null,
    cardPool: normalizeCardPool(cardPool),
    pending: [],
    pendingSeq: 0
  }),
  apply(state, action, seat) {
    if (action.type === 'ackCard') return acknowledgeCards(state, seat);
    if (state.pending.length > 0) return state;

    if (state.phase === 'reveal') {
      if (action.type !== 'next') return state;
      const starter = other(state.starter);
      return {
        dice: [rollDice(), rollDice()],
        turn: starter,
        bid: null,
        phase: 'bid',
        round: state.round + 1,
        starter,
        scores: state.scores,
        reveal: null,
        cardPool: state.cardPool,
        pending: [],
        pendingSeq: state.pendingSeq
      };
    }

    if (state.turn !== seat) return state;

    if (action.type === 'bid') {
      const qty = Math.max(1, Math.min(TOTAL_DICE, Math.floor(action.qty)));
      const face = Math.max(1, Math.min(6, Math.floor(action.face)));
      const current = state.bid;
      const legal =
        !current || qty > current.qty || (qty === current.qty && face > current.face);
      if (!legal) return state;
      return {
        ...state,
        bid: { qty, face, by: seat },
        turn: other(seat)
      };
    }

    if (action.type === 'challenge') {
      const bid = state.bid;
      if (!bid || bid.by === seat) return state;
      const all = [...state.dice[0], ...state.dice[1]];
      const count = all.filter(value => value === bid.face).length;
      const bidderWins = count >= bid.qty;
      const loser: Seat = bidderWins ? seat : bid.by;
      const winner: Seat = other(loser);
      const scores: [number, number] = [...state.scores] as [number, number];
      scores[winner] += 1;
      return {
        ...state,
        phase: 'reveal',
        reveal: { count, loser, winner },
        scores,
        ...enqueueCards(state.cardPool, state.pending, state.pendingSeq, [
          { drawerSeat: winner, executorSeat: loser, reason: '开牌判负 · 赢家抽卡，输家执行' }
        ])
      };
    }

    return state;
  },
  viewFor(state, seat) {
    const opp = other(seat);
    return {
      phase: state.phase,
      turn: state.turn,
      bid: state.bid,
      round: state.round,
      scores: state.scores,
      myDice: state.dice[seat],
      oppDice: state.phase === 'reveal' ? state.dice[opp] : null,
      oppDiceCount: DICE_EACH,
      reveal: state.reveal,
      pending: state.pending
    };
  },
  winnerOf: state => (state.round > 5 && state.scores[0] !== state.scores[1]
    ? (state.scores[0] > state.scores[1] ? 0 : 1)
    : null)
};

/* ------------------------------ 注册表 ------------------------------ */

export type OnlineModeKey = 'bluff' | 'go' | 'jungle';

export const ONLINE_MODES: Array<{
  key: OnlineModeKey;
  label: string;
  desc: string;
  createPlayers: (players: RoomPlayer[]) => RoomPlayer[];
}> = [
  { key: 'bluff', label: '吹牛骰', desc: '各看各的骰子，隔空诈唬', createPlayers: p => p },
  { key: 'go', label: '九路围棋', desc: '两台设备各看各的棋盘', createPlayers: p => p },
  { key: 'jungle', label: '斗兽棋', desc: '吃子同步，兽穴决胜', createPlayers: p => p }
];
