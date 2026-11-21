import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoom, reduceRoom } from '../rules/room';
import { seatScopedKey } from '../rules/registry';
import type { RoomSnapshot } from '../rules/types';
import {
  applyViewDelta,
  createViewDelta,
  loadRoomSnapshot,
  mergeSnapshot,
  publicSnapshot,
  saveRoomSnapshot
} from './useSharedRoom';

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

  it('applies compact consecutive view deltas and rejects sequence gaps', () => {
    const previous = createRoom('story', ['male', 'female'], 0);
    const next = reduceRoom(previous, {
      type: 'patchBatch',
      seat: 0,
      baseSeq: previous.seq,
      entries: [
        { key: 'changed', value: { count: 1 } },
        { key: 'second', value: true }
      ]
    });
    const delta = createViewDelta(previous, next);
    expect(delta.baseSeq).toBe(previous.seq);
    expect(delta.seq).toBe(next.seq);
    expect(delta.data).toEqual(next.data);
    expect(delta.changes).not.toHaveProperty('cardPool');
    expect(applyViewDelta(previous, delta)).toEqual(next);
    expect(applyViewDelta({ ...previous, seq: previous.seq + 1 }, delta)).toBeNull();
  });

  it('propagates removals without resending unchanged private-safe data', () => {
    const previous: RoomSnapshot = {
      ...createRoom('story', ['male', 'female'], 0),
      seq: 4,
      data: { keep: 'same', remove: 'old' },
      dataSeq: { keep: 2, remove: 3 }
    };
    const next: RoomSnapshot = {
      ...previous,
      seq: 5,
      data: { keep: 'same' },
      dataSeq: { keep: 2 }
    };
    const delta = createViewDelta(previous, next);
    expect(delta.data).toEqual({});
    expect(delta.removedData).toEqual(['remove']);
    expect(applyViewDelta(previous, delta)).toEqual(next);
  });

  it('keeps normal sync payloads compact when the card pool is unchanged', () => {
    const cardPool = Array.from({ length: 100 }, (_, index) => ({
      task: `task-${index}-${'x'.repeat(40)}`,
      themeName: 'shared'
    }));
    const previous: RoomSnapshot = { ...createRoom('card', ['male', 'female'], 0), cardPool };
    const next = reduceRoom(previous, { type: 'patch', seat: 0, baseSeq: 0, key: 'counter', value: 1 });
    const delta = createViewDelta(previous, next);
    expect(delta.changes).not.toHaveProperty('cardPool');
    expect(JSON.stringify(delta).length).toBeLessThan(JSON.stringify(next).length / 5);
  });
});
