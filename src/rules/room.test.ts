import { describe, expect, it } from 'vitest';
import { enqueueCard, extractCard } from './cards';
import { createRoom, reduceRoom, viewFor } from './room';
import { seatScopedKey } from './registry';
import type { RoomSnapshot, Seat } from './types';

function readyCard(
  state: RoomSnapshot,
  options: { moveDelta?: number; continuation?: RoomSnapshot['cards'][number]['continuation']; drawer?: Seat; executor?: Seat } = {}
): RoomSnapshot {
  const drawer = options.drawer ?? 0;
  const executor = options.executor ?? 1;
  const next = enqueueCard(state, {
    drawerSeat: drawer,
    executorSeat: executor,
    reason: 'test',
    card: { task: '任务', themeName: '测试' },
    moveDelta: options.moveDelta,
    continuation: options.continuation
  });
  const id = next.cards[0].id;
  return reduceRoom(next, { type: 'drawCard', seat: drawer, cardId: id, reveal: true });
}

describe('room card reducer', () => {
  it('turns a memory match into a durable public card and changes turn after acknowledgement', () => {
    const base = createRoom('memory', ['male', 'female'], 0);
    const matched = reduceRoom(base, {
      type: 'patchBatch',
      baseSeq: 0,
      seat: 0,
      entries: [
        { key: 'MemoryModeView.board', value: [{ pairId: 0, matchedBy: 0 }] },
        {
          key: 'MemoryModeView.matchTask',
          value: {
            type: 'card',
            initiatorPlayerId: 0,
            executorPlayerId: 1,
            targetPlayerId: 0,
            executionMode: 'directed',
            title: '记忆配对任务',
            subtitle: '任务来自「测试」',
            icon: 'sparkles',
            color: 'text-[#FF375F]',
            task: '女方拥抱男方十秒',
            taskSourceId: 'memory-test',
            themeName: '测试',
            moveDelta: 0,
            continuation: { kind: 'endTurn' }
          }
        }
      ]
    });

    expect(matched.data['MemoryModeView.board']).toEqual([{ pairId: 0, matchedBy: 0 }]);
    expect(matched.data['MemoryModeView.matchTask']).toBeUndefined();
    expect(matched.cards).toHaveLength(1);
    expect(matched.cards[0]).toMatchObject({
      drawerSeat: 0,
      executorSeat: 1,
      phase: 'locked',
      continuation: { kind: 'endTurn' },
      card: { task: '女方拥抱男方十秒', themeName: '测试' }
    });

    const revealed = reduceRoom(matched, {
      type: 'drawCard',
      seat: 0,
      cardId: matched.cards[0].id,
      reveal: true
    });
    const settled = reduceRoom(revealed, {
      type: 'ackCard',
      seat: 1,
      cardId: revealed.cards[0].id,
      outcome: 'accept'
    });
    expect(settled.cards).toHaveLength(0);
    expect(settled.turn).toBe(1);
  });

  it('draws and reveals with one action while retaining legacy snapshots', () => {
    const base = enqueueCard(createRoom('card', ['male', 'female'], 0), {
      drawerSeat: 1,
      executorSeat: 0,
      reason: 'single tap',
      card: { task: '一次点击', themeName: '测试' }
    });
    const id = base.cards[0].id;

    expect(reduceRoom(base, { type: 'drawCard', seat: 0, cardId: id, reveal: true })).toBe(base);
    expect(reduceRoom(base, { type: 'drawCard', seat: 1, cardId: id, reveal: true }).cards[0])
      .toMatchObject({ phase: 'revealed', card: { task: '一次点击' } });

    const legacyDrawn = reduceRoom(base, { type: 'drawCard', seat: 1, cardId: id });
    expect(legacyDrawn.cards[0].phase).toBe('drawn');
    expect(reduceRoom(legacyDrawn, { type: 'revealCard', seat: 1, cardId: id }).cards[0].phase)
      .toBe('revealed');
  });

  it('does not default a legacy card without an initiator to the male seat', () => {
    expect(extractCard({
      task: '兼容旧任务',
      executorPlayerId: 1,
      title: '旧任务'
    })).toMatchObject({ drawerSeat: 1, executorSeat: 1 });

    expect(extractCard({
      task: '明确由男方抽取',
      initiatorPlayerId: 0,
      executorPlayerId: 1
    })).toMatchObject({ drawerSeat: 0, executorSeat: 1 });
  });

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
    state = reduceRoom(state, { type: 'drawCard', seat: 0, cardId: firstId, reveal: true });
    state = reduceRoom(state, { type: 'ackCard', seat: 1, cardId: firstId, outcome: 'accept' });
    expect(state.turn).toBe(0);
    const lastId = state.cards[0].id;
    state = reduceRoom(state, { type: 'drawCard', seat: 0, cardId: lastId, reveal: true });
    state = reduceRoom(state, { type: 'ackCard', seat: 1, cardId: lastId, outcome: 'accept' });
    expect(state.turn).toBe(1);
  });
});

describe('authoritative minesweeper reducer', () => {
  const mineBoard = Array.from({ length: 36 }, (_, index) => ({
    type: index < 7 ? 'bomb' as const : 'blank' as const,
    revealed: false,
    adjacentMines: 0,
    revealedBy: null,
    flaggedBy: null
  }));

  it('accepts only the current seat and computes first-click safety on the host', () => {
    const room = {
      ...createRoom('mine', ['male', 'female'], 0, 1),
      data: { 'stage.mineBoard': mineBoard }
    };
    expect(reduceRoom(room, { type: 'mineReveal', seat: 0, index: 0, expectedTurn: 1 })).toBe(room);
    const next = reduceRoom(room, { type: 'mineReveal', seat: 1, index: 0, expectedTurn: 1 });
    const board = next.data['stage.mineBoard'] as typeof mineBoard;
    expect(board[0].revealed).toBe(true);
    expect(board[0].type).not.toBe('bomb');
    expect(next.data['stage.mineEvent']).toMatchObject({ seat: 1 });
  });

  it('marks without changing turn and rejects moves while an event is unresolved', () => {
    const room = {
      ...createRoom('mine', ['male', 'female'], 0, 0),
      data: { 'stage.mineBoard': mineBoard }
    };
    const flagged = reduceRoom(room, { type: 'mineToggleFlag', seat: 0, index: 8, expectedTurn: 0 });
    expect((flagged.data['stage.mineBoard'] as typeof mineBoard)[8].flaggedBy).toBe(0);
    expect(flagged.turn).toBe(0);
    const revealed = reduceRoom(flagged, { type: 'mineReveal', seat: 0, index: 9, expectedTurn: 0 });
    expect(reduceRoom(revealed, { type: 'mineToggleFlag', seat: 0, index: 10, expectedTurn: 0 })).toBe(revealed);
  });

  it('advances after a resolved safe event but keeps the final turn when the board is complete', () => {
    const room = {
      ...createRoom('mine', ['male', 'female'], 0, 0),
      data: {
        'stage.mineBoard': mineBoard,
        'stage.mineEvent': { id: 8, seat: 0, type: 'blank', completed: false }
      }
    };
    const next = reduceRoom(room, { type: 'mineFinishEvent', seat: 0, eventId: 8 });
    expect(next.turn).toBe(1);
    expect(next.data['stage.mineEvent']).toBeNull();

    const finished = {
      ...room,
      data: { ...room.data, 'stage.mineEvent': { id: 9, seat: 0, type: 'blank', completed: true } }
    };
    expect(reduceRoom(finished, { type: 'mineFinishEvent', seat: 0, eventId: 9 }).turn).toBe(0);
  });

  it('triggers one rotating task per four manual safe reveals and resets progress on a bomb', () => {
    let state: RoomSnapshot = {
      ...createRoom('mine', ['male', 'female'], 0, 0),
      data: { 'stage.mineBoard': mineBoard }
    };

    for (const index of [7, 8, 9, 10]) {
      state = reduceRoom({ ...state, turn: 0 }, { type: 'mineReveal', seat: 0, index, expectedTurn: 0 });
      const event = state.data['stage.mineEvent'] as { id: number; type: string };
      if (index < 10) expect(event.type).toBe('blank');
      else expect(event.type).toBe('truth');
      state = reduceRoom(state, { type: 'mineFinishEvent', seat: 0, eventId: event.id });
    }

    expect(state.data['stage.mineProgress']).toEqual([0, 0]);
    expect(state.data['stage.mineTaskCount']).toBe(1);

    state = {
      ...state,
      turn: 0,
      data: { ...state.data, 'stage.mineProgress': [3, 0] }
    };
    state = reduceRoom(state, { type: 'mineReveal', seat: 0, index: 0, expectedTurn: 0 });
    expect(state.data['stage.mineProgress']).toEqual([0, 0]);
    expect(state.data['stage.mineEvent']).toMatchObject({ type: 'bomb' });
  });
});

describe('turn ownership for shared modes', () => {
  it('completes a roulette round atomically and rejects the waiting seat', () => {
    const base: RoomSnapshot = {
      ...createRoom('roulette', ['male', 'female'], 0, 0),
      lobbyLocked: true,
      data: {
        'RouletteModeView.result': { executor: '男方', action: '亲吻', target: '脸颊', duration: '30 秒' },
        'RouletteModeView.bonusTask': { text: '加码', executor: 'both', moveDelta: 0 },
        'RouletteModeView.bonusThemeName': '测试',
        'RouletteModeView.isSpinning': false
      }
    };
    expect(reduceRoom(base, { type: 'rouletteComplete', seat: 1, expectedTurn: 0 })).toBe(base);

    const next = reduceRoom(base, { type: 'rouletteComplete', seat: 0, expectedTurn: 0 });
    expect(next.turn).toBe(1);
    expect(next.data['RouletteModeView.result']).toEqual({ executor: '', action: '', target: '', duration: '' });
    expect(next.data['RouletteModeView.bonusTask']).toBeNull();
    expect(reduceRoom(next, { type: 'rouletteComplete', seat: 0, expectedTurn: 0 })).toBe(next);
  });

  it('rejects roulette state patches from the waiting seat', () => {
    const base: RoomSnapshot = {
      ...createRoom('roulette', ['male', 'female'], 0, 0),
      lobbyLocked: true,
      data: { 'RouletteModeView.result': { executor: '', action: '', target: '', duration: '' } }
    };
    const rejected = reduceRoom(base, {
      type: 'patch',
      key: 'RouletteModeView.result',
      value: { executor: '女方' },
      baseSeq: 0,
      seat: 1
    });
    expect(rejected).toBe(base);
  });

  it('lets only the host advance an expired timed turn on behalf of the active seat', () => {
    const base = createRoom('survival', ['male', 'female'], 0, 1);
    expect(reduceRoom(base, { type: 'authorityEndTurn', seat: 1, expectedTurn: 1 })).toBe(base);
    const next = reduceRoom(base, { type: 'authorityEndTurn', seat: 0, expectedTurn: 1 });
    expect(next.turn).toBe(0);
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
