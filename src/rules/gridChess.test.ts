import { describe, expect, it } from 'vitest';
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
