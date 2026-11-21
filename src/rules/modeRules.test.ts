import { describe, expect, it } from 'vitest';
import type { Player, Theme, TileType } from '../types';
import { resolveBoardTile } from './modeRules';
import { turnKeyOfMode } from './registry';

const players: Player[] = [
  { id: 0, name: '男方', color: '#0A84FF', role: 'male', step: 2, themeId: 'male-theme' },
  { id: 1, name: '女方', color: '#FF375F', role: 'female', step: 7, themeId: 'female-theme' }
];

const themes: Theme[] = [
  {
    id: 'male-theme',
    name: '男方主题',
    desc: '',
    audience: 'common',
    modes: ['board'],
    tasks: [{ text: '男方任务', executor: 'both', moveDelta: 0 }],
    tags: []
  },
  {
    id: 'female-theme',
    name: '女方主题',
    desc: '',
    audience: 'common',
    modes: ['board'],
    tasks: [{ text: '女方任务', executor: 'both', moveDelta: 0 }],
    tags: []
  }
];

function boardWith(step: number, type: TileType): TileType[] {
  const board = Array<TileType>(49).fill('blank');
  board[step] = type;
  return board;
}

describe('online board card ownership', () => {
  it('uses the board-specific shared turn instead of the room fallback turn', () => {
    expect(turnKeyOfMode('board')).toBe('OnlineBoard.turn');
  });

  it('uses the flying-chess internal turn as the online stage turn', () => {
    expect(turnKeyOfMode('board')).toBe('OnlineBoard.turn');
  });

  it.each([
    { turn: 0, landingStep: 9, expectedDrawer: 0, expectedExecutor: 1 },
    { turn: 1, landingStep: 10, expectedDrawer: 1, expectedExecutor: 0 }
  ])('binds a lucky-card drawer to the player who actually moved (seat $turn)', ({
    turn,
    landingStep,
    expectedDrawer,
    expectedExecutor
  }) => {
    const result = resolveBoardTile({
      landingStep,
      players,
      themes,
      turn,
      boardMap: boardWith(landingStep, 'lucky')
    });

    expect(result).not.toBeNull();
    expect(result).not.toBe('win');
    if (!result || result === 'win') return;
    expect(result.initiatorPlayerId).toBe(expectedDrawer);
    expect(result.executorPlayerId).toBe(expectedExecutor);
  });

  it('keeps the female player as drawer and executor when she lands on a trap', () => {
    const result = resolveBoardTile({
      landingStep: 11,
      players,
      themes,
      turn: 1,
      boardMap: boardWith(11, 'trap')
    });

    expect(result).not.toBeNull();
    expect(result).not.toBe('win');
    if (!result || result === 'win') return;
    expect(result.initiatorPlayerId).toBe(1);
    expect(result.executorPlayerId).toBe(1);
  });
});
