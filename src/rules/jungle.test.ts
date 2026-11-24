import { describe, expect, it } from 'vitest';
import { applyMove, getLegalMoves, JUNGLE_CELLS, type JungleBoard } from '../utils/jungle';
import { createRoom, reduceRoom } from './room';
import type { RoomAction } from './types';

const emptyBoard = (): JungleBoard => Array(JUNGLE_CELLS).fill(null);

describe('Jungle captures', () => {
  it('lets a lion jump the full vertical river to capture, but a rat blocks the jump', () => {
    const board = emptyBoard();
    board[15] = { id: 1, owner: 0, rank: 7 };
    board[43] = { id: 2, owner: 1, rank: 3 };
    expect(getLegalMoves(board, 15)).toContain(43);
    expect(getLegalMoves(board, 15)).not.toContain(22);
    expect(applyMove(board, 15, 43)?.captured).toBe(board[43]);
    board[29] = { id: 3, owner: 0, rank: 1 };
    expect(applyMove(board, 15, 43)).toBeNull();
  });

  it.each([false, true])('commits the capture and rewards together (last piece: %s)', last => {
    const board = emptyBoard();
    board[15] = { id: 1, owner: 0, rank: 7 };
    board[43] = { id: 2, owner: 1, rank: 3 };
    if (!last) board[62] = { id: 3, owner: 1, rank: 2 };
    const base = { ...createRoom('jungle', ['male', 'female'], 0), data: {
      'JungleModeView.phase': 'play',
      'JungleModeView.board': board
    } };
    const action: RoomAction = { type: 'jungleMove', from: 15, to: 43, seat: 0, runId: 0, expectedMove: 0 };
    const result = reduceRoom(base, action);
    const placed = result.data['JungleModeView.board'] as JungleBoard;
    expect(placed[15]).toBeNull();
    expect(placed[43]?.id).toBe(1);
    expect(result.data['JungleModeView.captured']).toEqual({ 0: 1, 1: 0 });
    expect(result.cards).toHaveLength(last ? 2 : 1);
    expect(result.data['JungleModeView.turn']).toBe(last ? 0 : 1);
    expect(result.data['JungleModeView.winnerId']).toBe(last ? 0 : undefined);
    expect(reduceRoom(result, action)).toBe(result);
    if (!last) {
      const followup: RoomAction = { ...action, from: 62, to: 55, seat: 1, expectedMove: 1 };
      expect(reduceRoom(result, followup)).toBe(result);
      const card = result.cards[0];
      const revealed = reduceRoom(result, { type: 'drawCard', seat: 0, cardId: card.id, reveal: true });
      const settled = reduceRoom(revealed, { type: 'ackCard', seat: 1, cardId: card.id, outcome: 'skip' });
      expect(reduceRoom(settled, followup)).not.toBe(settled);
    }
  });
});
