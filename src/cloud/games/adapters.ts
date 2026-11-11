import { GameAdapter, RoomPlayer, Seat } from '../types';
import { GoBoard, createGoBoard, playMove, scoreGoBoard } from '../../utils/go';
import {
  JungleBoard,
  applyMove as applyJungleMove,
  createJungleBoard,
  getLegalMoves
} from '../../utils/jungle';

/* ------------------------------ 九路围棋 ------------------------------ */

export interface GoState {
  board: GoBoard;
  turn: Seat;
  captures: [number, number];
  koKey: string | null;
  lastMove: number | null;
  passes: number;
  winner: Seat | null;
  reason: 'den' | 'capture' | 'score' | 'resign' | null;
}

export type GoAction =
  | { type: 'place'; index: number }
  | { type: 'pass' }
  | { type: 'resign' };

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);

export const goAdapter: GameAdapter<GoState, GoAction, GoState> = {
  mode: 'go',
  label: '九路围棋',
  createInitial: () => ({
    board: createGoBoard(),
    turn: 0,
    captures: [0, 0],
    koKey: null,
    lastMove: null,
    passes: 0,
    winner: null,
    reason: null
  }),
  apply(state, action, seat) {
    if (state.winner !== null) return state;
    if (action.type === 'resign') {
      return { ...state, winner: other(seat), reason: 'resign' };
    }
    if (state.turn !== seat) return state;

    if (action.type === 'pass') {
      const passes = state.passes + 1;
      if (passes >= 2) {
        const score = scoreGoBoard(state.board);
        const winner: Seat = score.area[0] >= score.area[1] ? 0 : 1;
        return { ...state, passes, winner, reason: 'score' };
      }
      return { ...state, passes, turn: other(seat), koKey: null };
    }

    const result = playMove(state.board, action.index, seat, state.koKey);
    if (!result) return state;

    const captures: [number, number] = [...state.captures] as [number, number];
    captures[seat] += result.captured;

    return {
      ...state,
      board: result.board,
      koKey: result.koKey,
      lastMove: action.index,
      captures,
      passes: 0,
      turn: other(seat)
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
}

export type JungleAction =
  | { type: 'move'; from: number; to: number }
  | { type: 'resign' };

export const jungleAdapter: GameAdapter<JungleState, JungleAction, JungleState> = {
  mode: 'jungle',
  label: '斗兽棋',
  createInitial: () => ({
    board: createJungleBoard(),
    turn: 0,
    captured: [0, 0],
    lastMove: null,
    winner: null
  }),
  apply(state, action, seat) {
    if (state.winner !== null) return state;

    if (action.type === 'resign') {
      return { ...state, winner: other(seat) };
    }
    if (state.turn !== seat) return state;
    if (!getLegalMoves(state.board, action.from).includes(action.to)) return state;

    const result = applyJungleMove(state.board, action.from, action.to);
    if (!result) return state;

    const captured: [number, number] = [...state.captured] as [number, number];
    if (result.captured) captured[seat] += 1;

    return {
      ...state,
      board: result.board,
      captured,
      lastMove: { from: action.from, to: action.to },
      turn: other(seat),
      winner: result.winner !== null ? (result.winner as Seat) : null
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
}

export type BluffAction =
  | { type: 'bid'; qty: number; face: number }
  | { type: 'challenge' }
  | { type: 'next' };

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
}

export const bluffAdapter: GameAdapter<BluffState, BluffAction, BluffView> = {
  mode: 'bluff',
  label: '吹牛骰',
  createInitial: () => ({
    dice: [rollDice(), rollDice()],
    turn: 0,
    bid: null,
    phase: 'bid',
    round: 1,
    starter: 0,
    scores: [0, 0],
    reveal: null
  }),
  apply(state, action, seat) {
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
        reveal: null
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
        scores
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
      reveal: state.reveal
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
