import { describe, expect, it } from 'vitest';
import { createGoBoard, playMove } from '../utils/go';
import { createRoom, reduceRoom, viewFor } from './room';
import type { RoomAction } from './types';

describe('Go captures and online settlement', () => {
  const captured = [37, 38, 39, 41, 42, 43];
  const makeBoard = () => {
    const board = createGoBoard();
    for (const index of captured) board[index] = 0;
    for (const index of [28, 29, 30, 31, 32, 33, 34, 36, 44, 46, 47, 48, 49, 50, 51, 52]) board[index] = 1;
    return board;
  };

  it('captures two groups in a single move, even if the point has no empty neighbors before capture', () => {
    const board = makeBoard();
    const result = playMove(board, 40, 1, null);
    expect(result?.captured).toBe(6);
    expect(result?.board[40]).toBe(1);
    expect(captured.map(index => result?.board[index])).toEqual(Array(6).fill(null));
    expect(captured.map(index => board[index])).toEqual(Array(6).fill(0));
  });

  it('commits the capture, turn and both cards together, then resumes when both cards are confirmed', () => {
    const base = {
      ...createRoom('go', ['male', 'female'], 0),
      cardPool: [
        { task: '女方为男方倒水', themeName: 'test', executor: 'female' as const },
        { task: '男方为女方倒水', themeName: 'test', executor: 'male' as const }
      ],
      data: {
        'GoModeView.board': makeBoard(),
        'GoModeView.phase': 'play',
        'GoModeView.turn': 1,
        'GoModeView.captures': { 0: 0, 1: 2 },
        'GoModeView.runId': 2,
        'GoModeView.moveNumber': 6
      }
    };
    const action: RoomAction = { type: 'goPlay', kind: 'place', seat: 1, index: 40, runId: 2, expectedMove: 6 };
    expect(reduceRoom(base, { ...action, seat: 0 })).toBe(base);
    expect(reduceRoom(base, { ...action, runId: 1 })).toBe(base);
    const placed = reduceRoom(base, action);
    expect(placed.seq).toBe(base.seq + 1);
    expect(placed.data['GoModeView.board']).toEqual(playMove(makeBoard(), 40, 1, null)?.board);
    expect(placed.data['GoModeView.captures']).toEqual({ 0: 0, 1: 8 });
    expect(placed.data['GoModeView.turn']).toBe(0);
    expect(placed.cards).toHaveLength(2);
    expect(placed.cards.every(card => card.drawerSeat === 1 && card.executorSeat === 0)).toBe(true);
    expect(viewFor(placed, 0).cards.every(card => card.card === null)).toBe(true);

    const followup: RoomAction = { ...action, seat: 0, index: 39, expectedMove: 7 };
    expect(reduceRoom(placed, action)).toBe(placed);
    expect(reduceRoom(placed, followup)).toBe(placed);
    let settled = placed;
    for (const card of placed.cards) {
      settled = reduceRoom(settled, { type: 'drawCard', seat: 1, cardId: card.id, reveal: true });
      settled = reduceRoom(settled, { type: 'ackCard', seat: 0, cardId: card.id, outcome: 'skip' });
    }
    expect(settled.cards).toHaveLength(0);
    const next = reduceRoom(settled, followup);
    expect(next.data['GoModeView.lastMove']).toBe(39);
    expect(next.data['GoModeView.turn']).toBe(1);
  });
});
