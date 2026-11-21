import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom } from '../rules/room';
import { seatScopedKey } from '../rules/registry';
import type { RoomSnapshot } from '../rules/types';
import { loadRoomSnapshot, mergeSnapshot, publicSnapshot, saveRoomSnapshot } from './useSharedRoom';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('room snapshot privacy', () => {
  beforeEach(() => {
    const localStorage = new MemoryStorage();
    const sessionStorage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage, sessionStorage });
  });

  it('public heartbeat contains no pools, private dice, card faces or embedded task decks', () => {
    const base = createRoom('bluff', ['male', 'female'], 0);
    const state: RoomSnapshot = {
      ...base,
      cardPool: [{ task: 'secret card', themeName: 'secret' }],
      draftPools: [[{ task: 'draft 0', themeName: 'secret' }], [{ task: 'draft 1', themeName: 'secret' }]],
      cards: [{
        id: 1,
        cardIndex: 1,
        drawerSeat: 0 as const,
        executorSeat: 1 as const,
        reason: 'secret',
        phase: 'revealed' as const,
        card: { task: 'face', themeName: 'secret' },
        moveDelta: 0
      }],
      data: {
        publicTurn: 1,
        [seatScopedKey('BluffDiceModeView.dice', 0)]: [1, 2, 3, 4, 5],
        'AuctionModeView.queue': [{ task: { text: 'auction face' } }],
        'BingoModeView.cardPack': [{ task: { text: 'bingo face' } }],
        'QuizModeView.sealed': { value: 'answer' }
      }
    };
    const result = publicSnapshot(state);
    expect(result.cardPool).toEqual([]);
    expect(result.draftPools).toEqual([[], []]);
    expect(result.cards[0].card).toBeNull();
    expect(result.data).toEqual({ publicTurn: 1 });
  });

  it('public fallback preserves a locally rebuilt pool until a seat-specific view replaces it', () => {
    const local = { ...createRoom('card', ['male', 'female'], 0), cardPool: [{ task: 'rebuilt', themeName: 'local' }] };
    const fallback = publicSnapshot({ ...local, seq: 2 });
    expect(mergeSnapshot(local, fallback, 1).cardPool).toEqual(local.cardPool);
    const authoritative = { ...fallback, seq: 3, cardPool: [{ task: 'authority', themeName: 'remote' }] };
    expect(mergeSnapshot(local, authoritative, 1).cardPool).toEqual(authoritative.cardPool);
  });

  it('session persistence keeps lobby structure but drops plaintext pools and gameplay state', () => {
    const state: RoomSnapshot = {
      ...createRoom('card', ['male', 'female'], 0),
      lobbyLocked: true,
      picks: [
        { themeIds: ['theme-a'], locked: true },
        { themeIds: ['theme-b'], locked: true }
      ],
      cardPool: [{ task: 'plaintext', themeName: 'secret' }],
      draftPools: [[{ task: 'draft', themeName: 'secret' }], []],
      data: { answer: 'secret' },
      dataSeq: { answer: 5 }
    };
    saveRoomSnapshot('room', state);
    const restored = loadRoomSnapshot('room');
    expect(restored?.picks).toEqual(state.picks);
    expect(restored?.lobbyLocked).toBe(true);
    expect(restored?.cardPool).toEqual([]);
    expect(restored?.draftPools).toEqual([[], []]);
    expect(restored?.data).toEqual({});
    expect(restored?.cards).toEqual([]);
  });
});
