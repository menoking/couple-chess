import { describe, expect, it } from 'vitest';
import { createRoom, reduceRoom } from './room';
import type { RoomAction, RoomSnapshot } from './types';
import {
  GRID_HORIZONTAL_LINES,
  GRID_TOTAL_BOXES,
  GRID_VERTICAL_LINES,
  applyGridLine,
  type GridChessState
} from './gridChess';

function emptyGrid(): GridChessState {
  return {
    horizontal: Array.from({ length: GRID_HORIZONTAL_LINES }, () => ({ ownerId: null })),
    vertical: Array.from({ length: GRID_VERTICAL_LINES }, () => ({ ownerId: null })),
    boxes: Array.from({ length: GRID_TOTAL_BOXES }, () => -1)
  };
}

function draw(state: GridChessState, kind: 'h' | 'v', index: number, owner = 0) {
  const result = applyGridLine(state, kind, index, owner);
  expect(result).not.toBeNull();
  return result!;
}

describe('grid chess rules', () => {
  it('commits an online internal split and both reward cards atomically, then permits the next line', () => {
    let board = emptyGrid();
    for (const [kind, index] of [['h', 5], ['h', 6], ['h', 9], ['h', 10], ['v', 5], ['v', 13]] as const) {
      board = draw(board, kind, index).state;
    }
    const base: RoomSnapshot = {
      ...createRoom('gridchess', ['male', 'female'], 0),
      cardPool: [{ task: '测试任务', themeName: '测试', executor: 'both' }],
      data: {
        'GridChessModeView.started': true,
        'GridChessModeView.turn': 1,
        'GridChessModeView.horizontal': board.horizontal,
        'GridChessModeView.vertical': board.vertical,
        'GridChessModeView.boxes': board.boxes
      }
    };
    const action: RoomAction = { type: 'gridDrawLine', seat: 1, kind: 'v', index: 9, expectedLines: 6, runId: 0 };
    const split = reduceRoom(base, action);
    expect(split.data['GridChessModeView.boxes']).toEqual([-1, -1, -1, -1, -1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
    expect(split.cards).toHaveLength(2);
    expect(split.data['GridChessModeView.turn']).toBe(1);
    expect(reduceRoom(split, action)).toBe(split);
    expect(reduceRoom(base, { ...action, seat: 0 })).toBe(base);
    expect(reduceRoom(base, { ...action, runId: 1 })).toBe(base);
    expect(reduceRoom(base, { ...action, expectedLines: 5 })).toBe(base);
    const nextLine: RoomAction = { ...action, index: 10, expectedLines: 7 };
    expect(reduceRoom(split, nextLine)).toBe(split);
    let settled = split;
    for (const reward of split.cards) {
      settled = reduceRoom(settled, { type: 'drawCard', seat: 1, cardId: reward.id, reveal: true });
      settled = reduceRoom(settled, { type: 'ackCard', seat: 0, cardId: reward.id, outcome: 'skip' });
    }
    const continued = reduceRoom(settled, nextLine);
    expect(continued).not.toBe(settled);
    expect((continued.data['GridChessModeView.vertical'] as Array<{ownerId: number | null}>)[10].ownerId).toBe(1);
    expect(continued.data['GridChessModeView.turn']).toBe(0);
  });

  it('waits for the final reward before completing an online game', () => {
    const board = emptyGrid();
    board.horizontal.forEach(line => { line.ownerId = 0; });
    board.vertical.forEach(line => { line.ownerId = 0; });
    board.vertical[19].ownerId = null;
    board.boxes.fill(0);
    board.boxes[15] = -1;
    const base = { ...createRoom('gridchess', ['male', 'female'], 0), data: {
      'GridChessModeView.started': true,
      'GridChessModeView.turn': 0,
      'GridChessModeView.horizontal': board.horizontal,
      'GridChessModeView.vertical': board.vertical,
      'GridChessModeView.boxes': board.boxes
    } };
    const closed = reduceRoom(base, { type: 'gridDrawLine', seat: 0, kind: 'v', index: 19, expectedLines: 39, runId: 0 });
    expect(closed.data['GridChessModeView.finished']).not.toBe(true);
    const revealed = reduceRoom(closed, { type: 'drawCard', seat: 0, cardId: closed.cards[0].id, reveal: true });
    const done = reduceRoom(revealed, { type: 'ackCard', seat: 1, cardId: closed.cards[0].id, outcome: 'accept' });
    expect(done.data['GridChessModeView.finished']).toBe(true);
  });
  it('allows a large rectangle to be split into two small boxes with its internal line', () => {
    let state = emptyGrid();
    // 两格宽的长方形外框：上 h0/h1、下 h4/h5、左 v0、右 v8。
    for (const [kind, index] of [['h', 0], ['h', 1], ['h', 4], ['h', 5], ['v', 0], ['v', 8]] as const) {
      const result = draw(state, kind, index);
      state = result.state;
      expect(result.newlyClosed).toEqual([]);
    }

    // 中间竖线 v4 仍然合法，并应一次闭合左右两个单位正方形。
    const split = draw(state, 'v', 4, 1);
    expect(split.newlyClosed).toEqual([0, 1]);
    expect(split.state.boxes.slice(0, 2)).toEqual([1, 1]);
  });

  it('rejects duplicate and out-of-range lines without changing state', () => {
    const state = emptyGrid();
    const first = draw(state, 'h', 0).state;
    expect(applyGridLine(first, 'h', 0, 1)).toBeNull();
    expect(applyGridLine(first, 'v', GRID_VERTICAL_LINES, 1)).toBeNull();
  });
});
