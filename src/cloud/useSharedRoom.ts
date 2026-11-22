import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROOM_PROTOCOL_VERSION, type PendingCard, type RoomAction, type RoomActionEnvelope, type RoomSnapshot, type Seat } from '../rules/types';
import { reduceRoom, viewFor } from '../rules/room';
import { extractCard } from '../rules/cards';
import { privateKeyOf } from '../rules/registry';
import { reviveValue, serializeValue, type ModeRuntimeValue } from '../rules/ModeRuntime';
import { createTransport, type RoomTransport, type TransportKind } from './transport';
import { diagLog, setDiagnosticContext } from './diagnostics';
import { getDeviceId } from './device';
import { createActionEnvelope, normalizeEnvelopeAction, validateActionEnvelope } from './actionProtocol';

export interface SharedRoomInput {
  roomId: string | null;
  mySeat: Seat;
  hostSeat: Seat;
  kind: TransportKind;
  enabled: boolean;
  createInitial: () => RoomSnapshot;
  /** 两端都自认房主时，由本机主动重进房间让位 */
  onConflict?: () => void;
}

export interface SharedRoomResult {
  snapshot: RoomSnapshot | null;
  status: 'idle' | 'connecting' | 'playing' | 'error';
  presence: Seat[];
  error: string | null;
  dispatch: (action: RoomAction) => void;
  runtime: ModeRuntimeValue;
  requestView: () => void;
  /** 把关键状态写进 Presence，作为动作丢失时的兜底 */
  announce: (meta: Record<string, unknown>) => void;
}

const ROOM_SNAPSHOT_PREFIX = 'cfc:room-snapshot:';

export interface RoomViewDelta {
  protocolVersion: number;
  baseSeq: number;
  seq: number;
  changes: Partial<Omit<RoomSnapshot, 'data' | 'dataSeq'>>;
  data: Record<string, unknown>;
  removedData: string[];
  dataSeq: Record<string, number>;
  removedDataSeq: string[];
}

const DELTA_TOP_LEVEL_KEYS: Array<keyof Omit<RoomSnapshot, 'data' | 'dataSeq' | 'seq'>> = [
  'mode', 'turn', 'roles', 'hostSeat', 'cardPool', 'draftPools', 'picks', 'lobbyLocked',
  'cards', 'cardSeq', 'dataResetSeq', 'hostId'
];

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 只传相邻权威视图间真正变化的字段；序号缺口由接收端请求完整视图恢复。 */
export function createViewDelta(previous: RoomSnapshot, next: RoomSnapshot): RoomViewDelta {
  const changes: Record<string, unknown> = {};
  DELTA_TOP_LEVEL_KEYS.forEach(key => {
    if (!valuesEqual(previous[key], next[key])) changes[key] = next[key];
  });
  const data: Record<string, unknown> = {};
  Object.entries(next.data).forEach(([key, value]) => {
    if (!(key in previous.data) || !valuesEqual(previous.data[key], value)) data[key] = value;
  });
  const dataSeq: Record<string, number> = {};
  Object.entries(next.dataSeq).forEach(([key, value]) => {
    if (previous.dataSeq[key] !== value) dataSeq[key] = value;
  });
  return {
    protocolVersion: ROOM_PROTOCOL_VERSION,
    baseSeq: previous.seq,
    seq: next.seq,
    changes: changes as RoomViewDelta['changes'],
    data,
    removedData: Object.keys(previous.data).filter(key => !(key in next.data)),
    dataSeq,
    removedDataSeq: Object.keys(previous.dataSeq).filter(key => !(key in next.dataSeq))
  };
}

export function applyViewDelta(current: RoomSnapshot, delta: RoomViewDelta): RoomSnapshot | null {
  if (
    !delta || typeof delta !== 'object' ||
    delta.protocolVersion !== ROOM_PROTOCOL_VERSION ||
    typeof delta.baseSeq !== 'number' ||
    typeof delta.seq !== 'number' ||
    delta.baseSeq !== current.seq ||
    delta.seq <= current.seq ||
    !delta.changes || typeof delta.changes !== 'object' ||
    !delta.data || typeof delta.data !== 'object' ||
    !Array.isArray(delta.removedData) ||
    !delta.dataSeq || typeof delta.dataSeq !== 'object' ||
    !Array.isArray(delta.removedDataSeq)
  ) return null;
  const data = { ...current.data, ...delta.data };
  delta.removedData.forEach(key => delete data[key]);
  const dataSeq = { ...current.dataSeq, ...delta.dataSeq };
  delta.removedDataSeq.forEach(key => delete dataSeq[key]);
  return normalizeRoomSnapshot({
    ...current,
    ...delta.changes,
    seq: delta.seq,
    data,
    dataSeq
  });
}

export function normalizeRoomSnapshot(snapshot: RoomSnapshot): RoomSnapshot {
  const picks: RoomSnapshot['picks'] = ([0, 1] as const).map(index => {
    const pick = Array.isArray(snapshot.picks) ? snapshot.picks[index] : undefined;
    return {
      themeIds: Array.isArray(pick?.themeIds)
        ? pick.themeIds.filter((value): value is string => typeof value === 'string')
        : [],
      locked: pick?.locked === true
    };
  }) as RoomSnapshot['picks'];
  const cards: PendingCard[] = Array.isArray(snapshot.cards)
    ? snapshot.cards.map(card => {
        const executionMode = card.executionMode === 'together' ? 'together' : 'directed';
        return {
          ...card,
          executionMode,
          targetSeat: executionMode === 'together'
            ? null
            : card.targetSeat === 0 || card.targetSeat === 1
              ? card.targetSeat
              : card.executorSeat === 0 ? 1 : 0
        };
      })
    : [];
  return {
    ...snapshot,
    cardPool: Array.isArray(snapshot.cardPool) ? snapshot.cardPool : [],
    draftPools: Array.isArray(snapshot.draftPools) && snapshot.draftPools.length === 2
      ? snapshot.draftPools
      : [[], []],
    cards,
    picks,
    data: snapshot.data && typeof snapshot.data === 'object' ? snapshot.data : {},
    dataSeq: snapshot.dataSeq && typeof snapshot.dataSeq === 'object' ? snapshot.dataSeq : {},
    dataResetSeq: typeof snapshot.dataResetSeq === 'number' ? snapshot.dataResetSeq : 0
  };
}

/** 房主房间快照落 sessionStorage：组件重挂 / 刷新后不会退回「重新选卡包」。 */
export function loadRoomSnapshot(roomId: string): RoomSnapshot | null {
  try {
    const raw = window.sessionStorage.getItem(ROOM_SNAPSHOT_PREFIX + roomId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoomSnapshot;
    if (!parsed || typeof parsed.seq !== 'number') return null;
    const safeParsed = { ...(parsed as RoomSnapshot & Record<string, unknown>) };
    delete safeParsed.protocolVersion;
    delete safeParsed.actionId;
    delete safeParsed.deviceId;
    delete safeParsed.actorSeat;
    delete safeParsed.baseSeq;
    // 旧快照只保留大厅结构和主题 id；玩法状态、卡面与旧题库都不可信，恢复时本地重建。
    return normalizeRoomSnapshot({
      ...(safeParsed as unknown as RoomSnapshot),
      cards: [],
      cardPool: [],
      draftPools: [[], []],
      data: {},
      dataSeq: {},
      dataResetSeq: 0
    });
  } catch {
    return null;
  }
}

/** 用户主动「开始新一局」时清掉旧快照，避免把上一局的锁定状态带过来 */
export function clearRoomSnapshot(roomId: string): void {
  try {
    window.sessionStorage.removeItem(ROOM_SNAPSHOT_PREFIX + roomId);
  } catch {
    // 忽略
  }
}

export function saveRoomSnapshot(roomId: string, snapshot: RoomSnapshot): void {
  try {
    // 只保留房间结构：玩法局部状态和超长题库不进 sessionStorage，避免超配额
    const slim: RoomSnapshot = {
      ...snapshot,
      cards: [],
      cardPool: [],
      draftPools: [[], []],
      data: {},
      dataSeq: {},
      dataResetSeq: 0
    };
    window.sessionStorage.setItem(ROOM_SNAPSHOT_PREFIX + roomId, JSON.stringify(slim));
  } catch {
    // 隐私模式/容量不足时忽略
  }
}

/** 公共频道兜底快照：去掉卡面明文与他人私有状态，只保留房间结构。 */
export function publicSnapshot(state: RoomSnapshot): RoomSnapshot {
  const data: Record<string, unknown> = {};
  const dataSeq: Record<string, number> = {};
  const contentKeys = [
    '.cardPack',
    '.queue',
    '.taskData',
    '.reward',
    '.rewardQueue',
    '.sealed',
    'stage.bingoBoard',
    'cards.drawn'
  ];
  Object.entries(state.data).forEach(([key, value]) => {
    if (privateKeyOf(key) !== null || contentKeys.some(marker => key.includes(marker))) return;
    data[key] = value;
    if (typeof state.dataSeq?.[key] === 'number') dataSeq[key] = state.dataSeq[key];
  });
  return {
    ...state,
    hostId: getDeviceId(),
    cards: state.cards.map(card => ({ ...card, card: null })),
    cardPool: [],
    draftPools: [[], []],
    data,
    dataSeq
  };
}

/** 兜底快照收到后，保留本机已经看到的卡面明文和自己的私有状态。 */
export function mergeSnapshot(local: RoomSnapshot | null, incomingRaw: RoomSnapshot, seat: Seat): RoomSnapshot {
  const incoming = normalizeRoomSnapshot(incomingRaw);
  if (!local) return incoming;
  const cards: PendingCard[] = incoming.cards.map(card => {
    const mine = local.cards.find(item => item.id === card.id);
    if (mine && mine.phase === card.phase && mine.card) return { ...card, card: mine.card };
    return card;
  });
  // 公共心跳刻意省略题库、卡面和私有槽位；它只能覆盖携带的公共键，不能把
  // 座位专属视图已经拿到的内容删除。真正 reset 时则必须丢弃全部旧玩法状态。
  const reset = incoming.dataResetSeq > local.dataResetSeq;
  const data = reset ? { ...incoming.data } : { ...local.data, ...incoming.data };
  if (!reset) {
    Object.entries(local.data).forEach(([key, value]) => {
      if (privateKeyOf(key) === seat) data[key] = value;
    });
  }
  return {
    ...incoming,
    cards,
    data,
    cardPool: incoming.cardPool.length > 0 ? incoming.cardPool : local.cardPool,
    draftPools: incoming.draftPools.some(pool => pool.length > 0) ? incoming.draftPools : local.draftPools
  };
}

function rejectionReason(state: RoomSnapshot, action: RoomAction): string {
  if (action.type === 'patch') {
    if (action.baseSeq < state.dataResetSeq) return 'data-reset-conflict';
    if ((state.dataSeq[action.key] ?? 0) > action.baseSeq) return 'data-key-conflict';
  }
  if (action.type === 'patchBatch') {
    if (action.baseSeq < state.dataResetSeq) return 'data-reset-conflict';
    if (action.entries.some(entry => (state.dataSeq[entry.key] ?? 0) > action.baseSeq)) return 'data-key-conflict';
  }
  if ('cardId' in action && state.cards[0]?.id !== action.cardId) return 'stale-card';
  if (action.type === 'endTurn' && action.expectedTurn !== state.turn) return 'stale-turn';
  if ((action.type === 'mineReveal' || action.type === 'mineToggleFlag') && action.expectedTurn !== state.turn) return 'stale-turn';
  if (action.type === 'sealBid' && state.data['AuctionModeView.round'] !== action.round) return 'stale-round';
  if ((action.type === 'bluffReady' || action.type === 'bluffChallenge' || action.type === 'bluffNextRound')
    && state.data['BluffDiceModeView.round'] !== action.round) return 'stale-round';
  return 'rule-validation';
}

/**
 * 通用房间运行时：房主持有唯一权威 RoomSnapshot，动作按到达顺序 reduce，
 * 再用 viewFor 给每个座位单独下发视图。24 个玩法共用这一套，不再各写适配器。
 */
export function useSharedRoom(input: SharedRoomInput): SharedRoomResult {
  const { roomId, mySeat, hostSeat, kind, enabled, onConflict } = input;
  const isHost = mySeat === hostSeat;
  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<SharedRoomResult['status']>('idle');
  const [presence, setPresence] = useState<Seat[]>([]);
  const [error, setError] = useState<string | null>(null);

  const transportRef = useRef<RoomTransport | null>(null);
  const authoritativeRef = useRef<RoomSnapshot | null>(null);
  const viewRef = useRef<RoomSnapshot | null>(null);
  const listeners = useRef(new Set<() => void>());
  const reviveCache = useRef(new Map<string, { raw: unknown; value: unknown }>());
  const localVersion = useRef(0);
  const viewReady = useRef(false);
  const lastPresence = useRef('');
  const deviceSeats = useRef(new Map<string, Seat>([[getDeviceId(), mySeat]]));
  const seenActionIds = useRef(new Set<string>());
  const actionIds = useRef(new WeakMap<object, string>());
  const queuedActions = useRef<Array<{ envelope: RoomActionEnvelope; expiresAt: number }>>([]);
  const actionReceipts = useRef(new Map<string, { accepted: boolean; seq: number; seat: Seat }>());
  const pendingActions = useRef(new Map<string, {
    envelope: RoomActionEnvelope;
    attempts: number;
    timer: number | null;
    sentAt: number;
  }>());
  const lastSentViews = useRef(new Map<Seat, RoomSnapshot>());
  const syncStats = useRef({ full: 0, delta: 0, bytes: 0 });
  const initialRef = useRef(input.createInitial);
  initialRef.current = input.createInitial;

  const applySnapshot = useCallback((next: RoomSnapshot) => {
    const normalized = normalizeRoomSnapshot(next);
    localVersion.current = 0;
    viewRef.current = normalized;
    setSnapshot(normalized);
    listeners.current.forEach(listener => listener());
  }, []);

  const publishTimer = useRef<number | null>(null);
  const pendingPublish = useRef<RoomSnapshot | null>(null);

  const sendView = useCallback((state: RoomSnapshot, seat: Seat, forceFull = false) => {
    const transport = transportRef.current;
    if (!transport) return;
    const next = viewFor(state, seat);
    const previous = lastSentViews.current.get(seat);
    let kind = 'view';
    let payload: RoomSnapshot | RoomViewDelta = next;
    if (!forceFull && previous && next.seq > previous.seq) {
      kind = 'view-delta';
      payload = createViewDelta(previous, next);
    }
    transport.sendTo(seat, kind, payload);
    const stats = syncStats.current;
    if (kind === 'view-delta') stats.delta += 1;
    else stats.full += 1;
    stats.bytes += JSON.stringify(payload).length;
    if ((stats.full + stats.delta) % 20 === 0) {
      diagLog('room:sync-stats', { ...stats });
    }
    lastSentViews.current.set(seat, next);
  }, []);

  const flushPublish = useCallback(() => {
    publishTimer.current = null;
    const target = pendingPublish.current;
    pendingPublish.current = null;
    if (!target) return;
    if (roomId) saveRoomSnapshot(roomId, target);
    ([0, 1] as Seat[]).forEach(seat => {
      if (seat === mySeat) return;
      try {
        sendView(target, seat);
      } catch (error) {
        diagLog('room:send-error', {
          seat,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }, [mySeat, roomId, sendView]);

  const publish = useCallback(
    (state: RoomSnapshot, immediate = false) => {
      // 本机立刻落地：操作手感不能等广播
      applySnapshot(viewFor(state, mySeat));
      pendingPublish.current = state;
      if (immediate) {
        if (publishTimer.current !== null) window.clearTimeout(publishTimer.current);
        flushPublish();
        return;
      }
      if (publishTimer.current !== null) return;
      // 高频玩法 patch 保留一帧内合并；回合、卡片和大厅动作直接发出。
      publishTimer.current = window.setTimeout(flushPublish, 16);
    },
    [applySnapshot, flushPublish, mySeat]
  );

  // 卸载前把最后一帧补发出去，避免「刚操作完就退房」把末态丢掉
  useEffect(() => () => {
    if (publishTimer.current !== null) window.clearTimeout(publishTimer.current);
    const target = pendingPublish.current;
    if (!target || !transportRef.current) return;
    ([0, 1] as Seat[]).forEach(seat => {
      if (seat === mySeat) return;
      try {
        sendView(target, seat);
      } catch {
        // 卸载途中发送失败可忽略
      }
    });
  }, [mySeat, sendView]);

  const applyAction = useCallback(
    (action: RoomAction) => {
      if (!isHost) return false;
      const current = authoritativeRef.current;
      if (!current) return false;
      const next = reduceRoom(current, action);
      if (next === current) {
        // 记录被拒的动作，便于真机诊断「点了没反应」
        diagLog('room:rejected', {
          reason: rejectionReason(current, action),
          type: action.type,
          seat: 'seat' in action ? action.seat : '-',
          key: action.type === 'patch' ? action.key : undefined,
          turn: current.turn,
          phase: current.cards[0]?.phase ?? null,
          cards: current.cards.length
        });
        // 关键：写入方本地做过乐观更新，被拒后必须用权威快照把它冲掉。
        // 否则那台设备会一直显示「自己已经操作成功」，两端回合彻底分叉——
        // 表现就是双方都能操作、谁也等不到对方。
        publish(current, true);
        return false;
      }
      authoritativeRef.current = next;
      const immediate = action.type !== 'patch' && action.type !== 'patchBatch';
      publish(next, immediate);
      return true;
    },
    [isHost, publish]
  );

  const rejectEnvelope = useCallback((reason: string, envelope?: Partial<RoomActionEnvelope>) => {
    diagLog('room:envelope-rejected', {
      reason,
      actionId: envelope?.actionId,
      device: envelope?.deviceId?.slice(0, 8),
      seat: envelope?.actorSeat
    });
    if (reason !== 'duplicate-action' && (envelope?.actorSeat === 0 || envelope?.actorSeat === 1)) {
      transportRef.current?.sendTo(envelope.actorSeat, 'protocol-error', { reason, actionId: envelope.actionId });
    }
    const current = authoritativeRef.current;
    if (current) publish(current, true);
  }, [publish]);

  const acceptEnvelope = useCallback((value: unknown, allowQueue = true) => {
    if (!isHost) return;
    const candidate = value as Partial<RoomActionEnvelope> | null;
    if (candidate?.actionId) {
      const receipt = actionReceipts.current.get(candidate.actionId);
      if (receipt) {
        if (candidate.deviceId !== getDeviceId()) {
          transportRef.current?.sendTo(receipt.seat, 'action-ack', {
            actionId: candidate.actionId,
            accepted: receipt.accepted,
            seq: receipt.seq
          });
        }
        return;
      }
    }
    const checked = validateActionEnvelope(value, deviceSeats.current, seenActionIds.current);
    if (!checked.ok) {
      if (checked.reason === 'unknown-device' && allowQueue && value && typeof value === 'object') {
        const envelope = value as RoomActionEnvelope;
        if (typeof envelope.deviceId === 'string' && (envelope.actorSeat === 0 || envelope.actorSeat === 1)) {
          if (queuedActions.current.some(item => item.envelope.actionId === envelope.actionId)) return;
          queuedActions.current.push({ envelope, expiresAt: Date.now() + 1200 });
          window.setTimeout(() => {
            const index = queuedActions.current.findIndex(item => item.envelope.actionId === envelope.actionId);
            if (index < 0) return;
            const [pending] = queuedActions.current.splice(index, 1);
            const retry = validateActionEnvelope(pending.envelope, deviceSeats.current, seenActionIds.current);
            if (retry.ok) {
              seenActionIds.current.add(retry.envelope.actionId);
              const accepted = applyAction(normalizeEnvelopeAction(retry.envelope));
              const seq = authoritativeRef.current?.seq ?? retry.envelope.baseSeq;
              actionReceipts.current.set(retry.envelope.actionId, { accepted, seq, seat: retry.envelope.actorSeat });
              if (retry.envelope.deviceId !== getDeviceId()) {
                transportRef.current?.sendTo(retry.envelope.actorSeat, 'action-ack', {
                  actionId: retry.envelope.actionId,
                  accepted,
                  seq
                });
              }
            } else {
              rejectEnvelope(retry.reason, pending.envelope);
            }
          }, 1250);
          return;
        }
      }
      rejectEnvelope(checked.reason, value as Partial<RoomActionEnvelope>);
      return;
    }
    seenActionIds.current.add(checked.envelope.actionId);
    if (seenActionIds.current.size > 500) {
      const oldest = seenActionIds.current.values().next().value as string | undefined;
      if (oldest) seenActionIds.current.delete(oldest);
    }
    const accepted = applyAction(normalizeEnvelopeAction(checked.envelope));
    const seq = authoritativeRef.current?.seq ?? checked.envelope.baseSeq;
    actionReceipts.current.set(checked.envelope.actionId, { accepted, seq, seat: checked.envelope.actorSeat });
    if (actionReceipts.current.size > 500) {
      const oldest = actionReceipts.current.keys().next().value as string | undefined;
      if (oldest) actionReceipts.current.delete(oldest);
    }
    if (checked.envelope.deviceId !== getDeviceId()) {
      transportRef.current?.sendTo(checked.envelope.actorSeat, 'action-ack', {
        actionId: checked.envelope.actionId,
        accepted,
        seq
      });
    }
  }, [applyAction, isHost, rejectEnvelope]);

  useEffect(() => {
    if (!enabled || !roomId) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    const pendingActionMap = pendingActions.current;
    const transportStartedAt = Date.now();
    let firstViewLogged = false;
    const markFirstView = (source: string, seq: number) => {
      if (firstViewLogged) return;
      firstViewLogged = true;
      diagLog('room:first-view', { source, seq, ms: Date.now() - transportStartedAt });
    };
    setStatus('connecting');
    setError(null);
    setSnapshot(null);
    viewRef.current = null;
    viewReady.current = false;
    lastPresence.current = '';
    deviceSeats.current = new Map([[getDeviceId(), mySeat]]);
    seenActionIds.current.clear();
    queuedActions.current = [];
    actionReceipts.current.clear();
    lastSentViews.current.clear();
    syncStats.current = { full: 0, delta: 0, bytes: 0 };
    const connectionSyncStats = syncStats.current;
    pendingActions.current.forEach(item => {
      if (item.timer !== null) window.clearTimeout(item.timer);
    });
    pendingActions.current.clear();
    setDiagnosticContext({ roomStatus: 'connecting', roomError: null, presence: [], viewReady: false });
    diagLog('room:transport', { kind, room: roomId.slice(-8), seat: mySeat, isHost });

    const transport = createTransport(kind, roomId, mySeat, {
      onPublic: (messageKind, data) => {
        if (cancelled) return;
        // 公共频道兜底：座位频道丢包时，访客也能从房主心跳拿到房间结构
        if (messageKind === 'room-sync') {
          const incoming = data as RoomSnapshot;
          // 两端都自认房主：设备号大的一方主动重进让位，避免两端各跑一份结算
          if (isHost && incoming.hostId && incoming.hostId !== getDeviceId() && getDeviceId() > incoming.hostId) {
            diagLog('room:host-conflict', { myId: getDeviceId(), hostId: incoming.hostId });
            onConflictRef.current?.();
            return;
          }
          if (isHost) return;
          const current = viewRef.current;
          if (current && incoming.seq <= current.seq) return;
          applySnapshot(mergeSnapshot(current, incoming, mySeat));
          markFirstView('public-fallback', incoming.seq);
          viewReady.current = true;
          setStatus('playing');
          setDiagnosticContext({ roomStatus: 'playing', viewReady: true });
          diagLog('room:sync-fallback', { seq: incoming.seq });
          return;
        }
        if (!isHost) return;
        if (messageKind === 'action') {
          acceptEnvelope(data);
          return;
        }
        if (messageKind === 'request-view') {
          const current = authoritativeRef.current;
          const request = data && typeof data === 'object'
            ? data as { deviceId?: string; seat?: Seat }
            : {};
          const requestedSeat = request.deviceId ? deviceSeats.current.get(request.deviceId) : undefined;
          if (current && requestedSeat !== undefined) sendView(current, requestedSeat, true);
        }
      },
      onSeat: (messageKind, data) => {
        if (cancelled) return;
        if (messageKind === 'action-ack') {
          const ack = data && typeof data === 'object'
            ? data as { actionId?: string; accepted?: boolean; seq?: number }
            : {};
          if (ack.actionId) {
            const pending = pendingActions.current.get(ack.actionId);
            if (pending && pending.timer !== null) window.clearTimeout(pending.timer);
            pendingActions.current.delete(ack.actionId);
            diagLog('room:action-ack', {
              actionId: ack.actionId,
              accepted: ack.accepted,
              seq: ack.seq,
              rttMs: pending ? Date.now() - pending.sentAt : null,
              attempts: pending?.attempts ?? null
            });
          }
          return;
        }
        if (messageKind === 'protocol-error') {
          const detail = data && typeof data === 'object'
            ? data as { reason?: string; actionId?: string }
            : {};
          const reason = detail.reason;
          if (detail.actionId) {
            const pending = pendingActions.current.get(detail.actionId);
            if (pending && pending.timer !== null) window.clearTimeout(pending.timer);
            pendingActions.current.delete(detail.actionId);
          }
          const message = reason === 'protocol-mismatch'
            ? '联机协议版本不一致，请双方刷新页面后重新进入房间。'
            : '联机动作被房主拒绝，已恢复为权威状态。';
          setError(message);
          diagLog('room:protocol-error', { reason });
          return;
        }
        if (messageKind === 'view-delta') {
          const current = viewRef.current;
          const next = current ? applyViewDelta(current, data as RoomViewDelta) : null;
          if (!next) {
            diagLog('room:delta-gap', {
              current: current?.seq ?? null,
              base: (data as Partial<RoomViewDelta> | null)?.baseSeq ?? null
            });
            transportRef.current?.send('request-view', { seat: mySeat, deviceId: getDeviceId() });
            return;
          }
          viewReady.current = true;
          applySnapshot(next);
          markFirstView('delta', next.seq);
          setStatus('playing');
          setDiagnosticContext({ roomStatus: 'playing', viewReady: true });
          diagLog('room:view-delta', { seat: mySeat, seq: next.seq });
          return;
        }
        if (messageKind === 'view-seq') {
          const remoteSeq = data && typeof data === 'object' ? (data as { seq?: number }).seq : undefined;
          if (typeof remoteSeq === 'number' && remoteSeq > (viewRef.current?.seq ?? -1)) {
            transportRef.current?.send('request-view', { seat: mySeat, deviceId: getDeviceId() });
          }
          return;
        }
        if (messageKind !== 'view') return;
        const next = data as RoomSnapshot;
        // 网络乱序时旧快照可能晚到，无条件覆盖会让界面退回上一帧，
        // 表现为「操作了但画面没跟上 / 同步不出来」。
        const current = viewRef.current;
        if (current && next.seq < current.seq) {
          diagLog('room:view-stale', { seq: next.seq, current: current.seq });
          return;
        }
        viewReady.current = true;
        applySnapshot(next);
        markFirstView('full', next.seq);
        setStatus('playing');
        setDiagnosticContext({ roomStatus: 'playing', viewReady: true });
        diagLog('room:view', { seat: mySeat, seq: next.seq });
      },
      onPresence: (seats, metas) => {
        if (cancelled) return;
        setPresence(seats);
        setDiagnosticContext({ presence: seats });
        if (metas) {
          const nextMap = new Map<string, Seat>();
          nextMap.set(getDeviceId(), mySeat);
          metas.forEach(item => {
            if (item.deviceId) nextMap.set(item.deviceId, item.seat);
          });
          deviceSeats.current = nextMap;
          if (isHost && queuedActions.current.length > 0) {
            const pending = queuedActions.current;
            queuedActions.current = [];
            pending.forEach(item => acceptEnvelope(item.envelope));
          }
        }
        // 两台设备抢到同一座位时，两端都能操作同一方，表现就是「操作权混淆」。
        // Presence 现在按设备号上报，能直接发现；设备号大的一方主动重进让位。
        if (metas && metas.length > 1) {
          const bySeat = new Map<Seat, string[]>();
          metas.forEach(item => {
            if (!item.deviceId) return;
            bySeat.set(item.seat, [...(bySeat.get(item.seat) ?? []), item.deviceId]);
          });
          const mine = getDeviceId();
          const clash = [...bySeat.entries()].find(
            ([, ids]) => new Set(ids).size > 1
          );
          if (clash) {
            const [, ids] = clash;
            const sorted = [...ids].sort();
            if (ids.includes(mine) && sorted[sorted.length - 1] === mine) {
              diagLog('room:seat-conflict', { seat: clash[0], devices: sorted.map(id => id.slice(0, 8)) });
              onConflictRef.current?.();
              return;
            }
          }
        }
        const key = [...seats].sort().join(',');
        if (isHost && key !== lastPresence.current && authoritativeRef.current) {
          lastPresence.current = key;
          publish(authoritativeRef.current, true);
        }
        // Presence 兜底：对方已声明锁定但动作没到房主时，房主替它锁定。
        // 这条通道就是头像亮起用的通道，实测最稳。
        if (isHost && metas) {
          const peerSeat: Seat = mySeat === 0 ? 1 : 0;
          const peer = metas.find(item => item.seat === peerSeat);
          const current = authoritativeRef.current;
          if (peer?.lobbyLocked && current && !current.picks[peerSeat].locked) {
            const next = reduceRoom(current, {
              type: 'lockLobby',
              seat: peerSeat,
              themeIds: peer.themeIds ?? [],
              pool: current.draftPools[peerSeat]
            });
            authoritativeRef.current = next;
            publish(next, true);
            diagLog('room:lock-from-presence', { seat: peerSeat });
          }
        }
      }
    }, isHost);

    transportRef.current = transport;

    (async () => {
      try {
        await transport.connect();
        if (cancelled) return;
        diagLog('room:transport-ready', { ms: Date.now() - transportStartedAt, kind, isHost });
        if (isHost) {
          const initial = normalizeRoomSnapshot(initialRef.current());
          authoritativeRef.current = initial;
          // 先把状态切到 playing，再广播；发送异常也不影响房主进入大厅
          setStatus('playing');
          setDiagnosticContext({ roomStatus: 'playing', viewReady: true });
          diagLog('room:host-ready', { seat: mySeat });
          publish(initial, true);
        } else {
          transport.send('request-view', { seat: mySeat, deviceId: getDeviceId() });
          diagLog('room:guest-waiting', { seat: mySeat });
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '联机初始化失败';
        setError(message);
        setStatus('error');
        setDiagnosticContext({ roomStatus: 'error', roomError: message });
        diagLog('room:error', { message });
      }
    })();

    return () => {
      cancelled = true;
      transport.close();
      if (connectionSyncStats.full + connectionSyncStats.delta > 0) {
        diagLog('room:sync-summary', { ...connectionSyncStats });
      }
      pendingActionMap.forEach(item => {
        if (item.timer !== null) window.clearTimeout(item.timer);
      });
      pendingActionMap.clear();
      transportRef.current = null;
      authoritativeRef.current = null;
    };
  }, [enabled, isHost, kind, mySeat, publish, acceptEnvelope, applySnapshot, roomId, sendView]);

  // 访客首包可能发得太早，拿到视图前持续重试
  useEffect(() => {
    if (!enabled || !roomId || isHost) return;
    const timer = window.setInterval(() => {
      if (viewReady.current) return;
      transportRef.current?.send('request-view', { seat: mySeat, deviceId: getDeviceId() });
    }, 900);
    return () => window.clearInterval(timer);
  }, [enabled, roomId, isHost, mySeat]);

  // 低频公共兜底只负责发现断层；正常操作使用座位增量包，不再持续发送完整视图。
  // 座位频道任何环节丢包时，访客仍能进大厅、看到双方锁定状态并正常开局
  useEffect(() => {
    if (!enabled || !roomId || !isHost) return;
    const timer = window.setInterval(() => {
      const current = authoritativeRef.current;
      if (!current) return;
      try {
        transportRef.current?.send('room-sync', publicSnapshot(current));
      } catch (error) {
        diagLog('room:sync-error', { message: error instanceof Error ? error.message : String(error) });
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [enabled, roomId, isHost]);

  // 房主定期把局面补发给对方：即使 request-view 和首包都丢了，也能在 2.5 秒内自愈
  useEffect(() => {
    if (!enabled || !roomId || !isHost) return;
    const peer: Seat = mySeat === 0 ? 1 : 0;
    const timer = window.setInterval(() => {
      const current = authoritativeRef.current;
      if (!current) return;
      transportRef.current?.sendTo(peer, 'view-seq', { seq: current.seq });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [enabled, roomId, isHost, mySeat]);

  const sendActionWithRetry = useCallback((envelope: RoomActionEnvelope) => {
    if (pendingActions.current.has(envelope.actionId)) return;
    pendingActions.current.set(envelope.actionId, {
      envelope,
      attempts: 0,
      timer: null,
      sentAt: Date.now()
    });

    const transmit = () => {
      const pending = pendingActions.current.get(envelope.actionId);
      if (!pending) return;
      transportRef.current?.send('action', pending.envelope);
      pending.attempts += 1;
      const delays = [250, 600, 1200, 2000];
      const delay = delays[Math.min(pending.attempts - 1, delays.length - 1)];
      pending.timer = window.setTimeout(() => {
        const latest = pendingActions.current.get(envelope.actionId);
        if (!latest) return;
        if (latest.attempts >= delays.length) {
          pendingActions.current.delete(envelope.actionId);
          diagLog('room:action-timeout', { actionId: envelope.actionId, attempts: latest.attempts });
          transportRef.current?.send('request-view', { seat: mySeat, deviceId: getDeviceId() });
          return;
        }
        transmit();
      }, delay);
    };

    transmit();
  }, [mySeat]);

  const dispatch = useCallback(
    (action: RoomAction) => {
      const existingId = actionIds.current.get(action as object);
      const envelope = createActionEnvelope(
        action,
        getDeviceId(),
        mySeat,
        viewRef.current?.seq ?? authoritativeRef.current?.seq ?? 0,
        existingId
      );
      actionIds.current.set(action as object, envelope.actionId);
      if (isHost) {
        acceptEnvelope(envelope);
        return;
      }
      sendActionWithRetry(envelope);
    },
    [acceptEnvelope, isHost, mySeat, sendActionWithRetry]
  );

  // 反序列化结果必须保持引用稳定，否则视图里以共享状态为依赖的 useEffect 会无限重跑
  const get = useCallback((key: string) => {
    const raw = viewRef.current?.data[key];
    const cached = reviveCache.current.get(key);
    if (cached && cached.raw === raw) return cached.value;
    const value = reviveValue(raw);
    reviveCache.current.set(key, { raw, value });
    return value;
  }, []);
  const getVersion = useCallback(
    () => (viewRef.current?.seq ?? 0) + localVersion.current,
    []
  );
  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);
  const readSnapshot = useCallback(() => viewRef.current, []);

  const patchQueue = useRef<Array<{ key: string; value: unknown }>>([]);
  const patchTimer = useRef<number | null>(null);

  const patch = useCallback(
    (key: string, value: unknown) => {
      const encoded = serializeValue(value);
      const current = viewRef.current;
      // 任务卡由公共四阶段 CardGate 接管，本地不做乐观更新，避免内嵌弹窗抢先显示卡面
      const intercepted = extractCard(value) !== null;
      if (current && !intercepted) {
        // 乐观更新，避免等广播往返才看到自己的操作
        viewRef.current = { ...current, data: { ...current.data, [key]: encoded } };
        localVersion.current += 1;
        listeners.current.forEach(listener => listener());
      }
      // 同一帧里的多个 patch 合并成一条消息：斗兽棋一次吃子会写棋盘 / 选中 /
      // 计数 / 队列 / 回合，逐条发送既慢又容易被限流丢掉其中一条，
      // 丢掉「回合」就会出现「棋走了但没换人」。
      patchQueue.current.push({ key, value: encoded });
      if (patchTimer.current !== null) return;
      patchTimer.current = window.setTimeout(() => {
        patchTimer.current = null;
        const entries = patchQueue.current;
        patchQueue.current = [];
        if (entries.length === 0) return;
        const baseSeq = viewRef.current?.seq ?? 0;
        if (entries.length === 1) {
          dispatch({ type: 'patch', key: entries[0].key, value: entries[0].value, baseSeq, seat: mySeat });
          return;
        }
        dispatch({ type: 'patchBatch', entries, baseSeq, seat: mySeat });
      }, 0);
    },
    [dispatch, mySeat]
  );

  useEffect(() => () => {
    if (patchTimer.current !== null) window.clearTimeout(patchTimer.current);
    patchQueue.current = [];
  }, []);

  const runtime = useMemo<ModeRuntimeValue>(
    () => ({ seat: mySeat, roomId: roomId ?? '', authority: isHost, get, patch, subscribe, getVersion, snapshot: readSnapshot, dispatch }),
    [mySeat, roomId, isHost, get, patch, subscribe, getVersion, readSnapshot, dispatch]
  );

  const requestView = useCallback(() => {
    transportRef.current?.send('request-view', { seat: mySeat, deviceId: getDeviceId() });
  }, [mySeat]);

  const announce = useCallback((meta: Record<string, unknown>) => {
    transportRef.current?.track(meta);
  }, []);

  return { snapshot, status, presence, error, dispatch, runtime, requestView, announce };
}
