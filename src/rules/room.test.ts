import { describe, expect, it } from 'vitest';
import { enqueueCard } from './cards';
import { createRoom, reduceRoom, viewFor } from './room';
import { seatScopedKey } from './registry';
import type { RoomSnapshot, Seat } from './types';

function readyCard(
  state: RoomSnapshot,
  options: { moveDelta?: number; continuation?: RoomSnapshot['cards'][number]['continuation']; drawer?: Seat; executor?: Seat } = {}
): RoomSnapshot {
  const drawer = options.drawer ?? 0;
  const executor = options.executor ?? 1;
  let next = enqueueCard(state, {
    drawerSeat: drawer,
    executorSeat: executor,
    reason: 'test',
    card: { task: '任务', themeName: '测试' },
    moveDelta: options.moveDelta,
    continuation: options.continuation
  });
  const id = next.cards[0].id;
  next = reduceRoom(next, { type: 'drawCard', seat: drawer, cardId: id });
  return reduceRoom(next, { type: 'revealCard', seat: drawer, cardId: id });
}

describe('room card reducer', () => {
  it('accept applies movement while skip does not', () => {
    const base = { ...createRoom('board', ['male', 'female'], 0), data: { 'stage.steps': [4, 7] } };
    const accepted = readyCard(base, { moveDelta: 3 });
    const acceptedId = accepted.cards[0].id;
    expect(reduceRoom(accepted, { type: 'ackCard', seat: 1, cardId: acceptedId, outcome: 'accept' }).data['stage.steps']).toEqual([4, 10]);

    const skipped = readyCard(base, { moveDelta: 3 });
    const skippedId = skipped.cards[0].id;
    expect(reduceRoom(skipped, { type: 'ackCard', seat: 1, cardId: skippedId, outcome: 'skip' }).data['stage.steps']).toEqual([4, 7]);
  });

  it('rejects a stale card id and makes repeated acknowledgements idempotent', () => {
    const state = readyCard(createRoom('card', ['male', 'female'], 0));
    const id = state.cards[0].id;
    expect(reduceRoom(state, { type: 'ackCard', seat: 1, cardId: id + 1, outcome: 'accept' })).toBe(state);
    const cleared = reduceRoom(state, { type: 'ackCard', seat: 1, cardId: id, outcome: 'accept' });
    expect(cleared.cards).toHaveLength(0);
    expect(reduceRoom(cleared, { type: 'ackCard', seat: 1, cardId: id, outcome: 'accept' })).toBe(cleared);
  });

  it('atomically completes Sudoku after the final card', () => {
    const base = {
      ...createRoom('sudoku', ['male', 'female'], 0),
      data: { 'SudokuModeView.turn': 0, 'SudokuModeView.finished': false }
    };
    const state = readyCard(base, { continuation: { kind: 'sudoku', finish: true } });
    const next = reduceRoom(state, { type: 'ackCard', seat: 1, cardId: state.cards[0].id, outcome: 'accept' });
    expect(next.cards).toHaveLength(0);
    expect(next.data['SudokuModeView.finished']).toBe(true);
    expect(next.data['SudokuModeView.turn']).toBe(0);
  });

  it('clears Auction round state and advances exactly once for accept or skip', () => {
    const base = {
      ...createRoom('auction', ['male', 'female'], 0),
      data: {
        'AuctionModeView.round': 3,
        'AuctionModeView.revealed': { bids: [10, 5], winner: 0 },
        'AuctionModeView.confirmed': [true, true]
      }
    };
    const state = readyCard(base, { continuation: { kind: 'auction', round: 3 } });
    const next = reduceRoom(state, { type: 'ackCard', seat: 1, cardId: state.cards[0].id, outcome: 'skip' });
    expect(next.data['AuctionModeView.round']).toBe(4);
    expect(next.data['AuctionModeView.revealed']).toBeNull();
    expect(next.data['AuctionModeView.confirmed']).toEqual([false, false]);
    expect(next.data['AuctionModeView.notice']).toBe('拍得任务却跳过，金币不退');
    expect(reduceRoom(next, { type: 'ackCard', seat: 1, cardId: state.cards[0].id, outcome: 'skip' })).toBe(next);
  });

  it('Bingo changes turn only after the last reward card', () => {
    let state = createRoom('bingo', ['male', 'female'], 0);
    state = enqueueCard(state, { drawerSeat: 0, executorSeat: 1, reason: 'first', card: { task: '1', themeName: 't' } });
    state = enqueueCard(state, { drawerSeat: 0, executorSeat: 1, reason: 'last', card: { task: '2', themeName: 't' }, continuation: { kind: 'endTurn' } });
    const firstId = state.cards[0].id;
    state = reduceRoom(state, { type: 'drawCard', seat: 0, cardId: firstId });
    state = reduceRoom(state, { type: 'revealCard', seat: 0, cardId: firstId });
    state = reduceRoom(state, { type: 'ackCard', seat: 1, cardId: firstId, outcome: 'accept' });
    expect(state.turn).toBe(0);
    const lastId = state.cards[0].id;
    state = reduceRoom(state, { type: 'drawCard', seat: 0, cardId: lastId });
    state = reduceRoom(state, { type: 'revealCard', seat: 0, cardId: lastId });
    state = reduceRoom(state, { type: 'ackCard', seat: 1, cardId: lastId, outcome: 'accept' });
    expect(state.turn).toBe(1);
  });
});

describe('optimistic concurrency', () => {
  it('merges stale writes to different keys but rejects a stale write to the same key', () => {
    const base = createRoom('story', ['male', 'female'], 0);
    const first = reduceRoom(base, { type: 'patch', key: 'a', value: 1, baseSeq: 0, seat: 0 });
    const merged = reduceRoom(first, { type: 'patch', key: 'b', value: 2, baseSeq: 0, seat: 1 });
    expect(merged.data).toMatchObject({ a: 1, b: 2 });
    expect(reduceRoom(merged, { type: 'patch', key: 'a', value: 9, baseSeq: 0, seat: 1 })).toBe(merged);
  });

  it('validates patchBatch completely before applying any entry', () => {
    const base = createRoom('story', ['male', 'female'], 0);
    const current = reduceRoom(base, { type: 'patch', key: 'changed', value: 1, baseSeq: 0, seat: 0 });
    const rejected = reduceRoom(current, {
      type: 'patchBatch',
      baseSeq: 0,
      seat: 1,
      entries: [{ key: 'fresh', value: 2 }, { key: 'changed', value: 3 }]
    });
    expect(rejected).toBe(current);
    expect(rejected.data.fresh).toBeUndefined();
  });

  it('rejects patches issued before a data reset', () => {
    const base = reduceRoom(createRoom('story', ['male', 'female'], 0), { type: 'patch', key: 'x', value: 1, baseSeq: 0, seat: 0 });
    const restarted = reduceRoom(base, { type: 'restart', seat: 0 });
    expect(reduceRoom(restarted, { type: 'patch', key: 'y', value: 2, baseSeq: 0, seat: 1 })).toBe(restarted);
  });
});

describe('bluff dice privacy', () => {
  it('keeps each hand private before challenge and reveals both hands after authority settlement', () => {
    const hand0 = [1, 1, 2, 3, 4];
    const hand1 = [1, 5, 6, 6, 2];
    const base = createRoom('bluff', ['male', 'female'], 0);
    const state: RoomSnapshot = {
      ...base,
      data: {
        'BluffDiceModeView.round': 1,
        'BluffDiceModeView.turn': 1,
        'BluffDiceModeView.phase': 'bid',
        'BluffDiceModeView.bid': { qty: 3, face: 1, by: 0 },
        'BluffDiceModeView.points': { 0: 0, 1: 0 },
        [seatScopedKey('BluffDiceModeView.dice', 0)]: hand0,
        [seatScopedKey('BluffDiceModeView.dice', 1)]: hand1
      }
    };
    expect(viewFor(state, 0).data[seatScopedKey('BluffDiceModeView.dice', 1)]).toBeUndefined();
    expect(viewFor(state, 1).data[seatScopedKey('BluffDiceModeView.dice', 0)]).toBeUndefined();

    const settled = reduceRoom(state, { type: 'bluffChallenge', seat: 1, round: 1 });
    const reveal0 = viewFor(settled, 0).data['BluffDiceModeView.reveal'];
    const reveal1 = viewFor(settled, 1).data['BluffDiceModeView.reveal'];
    expect(reveal0).toEqual(reveal1);
    expect(reveal0).toMatchObject({ count: 3, bidderWins: true, loserId: 1, winnerId: 0, dice: [hand0, hand1] });
    expect(reduceRoom(settled, { type: 'bluffChallenge', seat: 1, round: 0 })).toBe(settled);
  });
});
