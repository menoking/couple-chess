import { describe, expect, it } from 'vitest';
import type { MineTile, MineTileType } from '../types';
import {
  MINE_TILES_COUNT,
  hydrateMineBoard,
  mineScores,
  revealMineBoard,
  toggleMineFlag
} from './gameLogic';

function boardWith(bombs: number[], overrides: Partial<Record<number, MineTileType>> = {}): MineTile[] {
  const bombSet = new Set(bombs);
  return hydrateMineBoard(Array.from({ length: MINE_TILES_COUNT }, (_, index) => ({
    type: overrides[index] ?? (bombSet.has(index) ? 'bomb' : 'blank'),
    revealed: false,
    adjacentMines: 0,
    revealedBy: null,
    flaggedBy: null
  })));
}

describe('minesweeper rules', () => {
  it('calculates the bomb count from all eight neighboring cells', () => {
    const board = boardWith([0, 1, 6]);
    expect(board[7].adjacentMines).toBe(3);
    expect(board[2].adjacentMines).toBe(1);
    expect(board[35].adjacentMines).toBe(0);
  });

  it('moves a bomb away from the first clicked cell without changing bomb count', () => {
    const board = boardWith([0, 5, 10, 15, 20, 25, 30]);
    const result = revealMineBoard(board, 0, 1);
    expect(result?.firstMoveProtected).toBe(true);
    expect(result?.type).not.toBe('bomb');
    expect(result?.board.filter(tile => tile.type === 'bomb')).toHaveLength(7);
    expect(result?.board[0].revealedBy).toBe(1);
  });

  it('expands a zero region but never opens a bomb', () => {
    const board = boardWith([0]);
    const result = revealMineBoard(board, 35, 0);
    expect(result?.revealedIndices.length).toBeGreaterThan(1);
    expect(result?.board[0].revealed).toBe(false);
    expect(result?.completed).toBe(true);
  });

  it('does not reveal flagged cells and lets the current player toggle a flag', () => {
    const board = boardWith([0]);
    const flagged = toggleMineFlag(board, 0, 1)!;
    expect(flagged[0].flaggedBy).toBe(1);
    expect(revealMineBoard(flagged, 0, 1)).toBeNull();
    expect(toggleMineFlag(flagged, 0, 0)?.[0].flaggedBy).toBeNull();
  });

  it('scores safe cells, correct flags and bomb hits', () => {
    const board = boardWith([0, 1]).map((tile, index) => {
      if (index === 0) return { ...tile, revealed: true, revealedBy: 0 as const };
      if (index === 1) return { ...tile, flaggedBy: 1 as const };
      if (index === 2) return { ...tile, revealed: true, revealedBy: 0 as const };
      return tile;
    });
    expect(mineScores(board)).toEqual([-1, 2]);
  });
});
