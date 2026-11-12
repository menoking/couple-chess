import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomAction, RoomSnapshot, Seat } from '../rules/types';
import { reduceRoom, viewFor } from '../rules/room';
import { extractCard } from '../rules/cards';
import { reviveValue, serializeValue, type ModeRuntimeValue } from '../rules/ModeRuntime';
import { createTransport, type RoomTransport, type TransportKind } from './transport';
import { diagLog, setDiagnosticContext } from './diagnostics';

export interface SharedRoomInput {
  roomId: string | null;
  mySeat: Seat;
  hostSeat: Seat;
  kind: TransportKind;
  enabled: boolean;
  createInitial: () => RoomSnapshot;
}

export interface SharedRoomResult {
  snapshot: RoomSnapshot | null;
  status: 'idle' | 'connecting' | 'playing' | 'error';
  presence: Seat[];
  error: string | null;
  dispatch: (action: RoomAction) => void;
  runtime: ModeRuntimeValue;
  requestView: () => void;
}

/**
 * 通用房间运行时：房主持有唯一权威 RoomSnapshot，动作按到达顺序 reduce，
 * 再用 viewFor 给每个座位单独下发视图。24 个玩法共用这一套，不再各写适配器。
 */
export function useSharedRoom(input: SharedRoomInput): SharedRoomResult {
  const { roomId, mySeat, hostSeat, kind, enabled } = input;
  const isHost = mySeat === hostSeat;

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
  const initialRef = useRef(input.createInitial);
  initialRef.current = input.createInitial;

  const applySnapshot = useCallback((next: RoomSnapshot) => {
    localVersion.current = 0;
    viewRef.current = next;
    setSnapshot(next);
    listeners.current.forEach(listener => listener());
  }, []);

  const publish = useCallback(
    (state: RoomSnapshot) => {
      applySnapshot(viewFor(state, mySeat));
      const transport = transportRef.current;
      if (!transport) return;
      ([0, 1] as Seat[]).forEach(seat => {
        transport.sendTo(seat, 'view', viewFor(state, seat));
      });
    },
    [applySnapshot, mySeat]
  );

  const applyAction = useCallback(
    (action: RoomAction) => {
      if (!isHost) return;
      const current = authoritativeRef.current;
      if (!current) return;
      const next = reduceRoom(current, action);
      if (next === current) return;
      authoritativeRef.current = next;
      publish(next);
    },
    [isHost, publish]
  );

  useEffect(() => {
    if (!enabled || !roomId) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('connecting');
    setError(null);
    setSnapshot(null);
    viewRef.current = null;
    viewReady.current = false;
    lastPresence.current = '';
    setDiagnosticContext({ roomStatus: 'connecting', roomError: null, presence: [], viewReady: false });
    diagLog('room:transport', { kind, room: roomId.slice(-8), seat: mySeat, isHost });

    const transport = createTransport(kind, roomId, mySeat, {
      onPublic: (messageKind, data) => {
        if (cancelled || !isHost) return;
        if (messageKind === 'action') {
          const envelope = data as { seat?: Seat; action?: RoomAction } | null;
          if (typeof envelope?.seat !== 'number' || !envelope.action) return;
          applyAction(envelope.action);
          return;
        }
        if (messageKind === 'request-view') {
          const current = authoritativeRef.current;
          if (current) publish(current);
        }
      },
      onSeat: (messageKind, data) => {
        if (cancelled || messageKind !== 'view') return;
        const next = data as RoomSnapshot;
        viewReady.current = true;
        applySnapshot(next);
        setStatus('playing');
        setDiagnosticContext({ roomStatus: 'playing', viewReady: true });
        diagLog('room:view', { seat: mySeat, seq: next.seq });
      },
      onPresence: seats => {
        if (cancelled) return;
        setPresence(seats);
        setDiagnosticContext({ presence: seats });
        const key = [...seats].sort().join(',');
        if (isHost && key !== lastPresence.current && authoritativeRef.current) {
          lastPresence.current = key;
          publish(authoritativeRef.current);
        }
      }
    });

    transportRef.current = transport;

    (async () => {
      try {
        await transport.connect();
        if (cancelled) return;
        if (isHost) {
          const initial = initialRef.current();
          authoritativeRef.current = initial;
          publish(initial);
          setStatus('playing');
          setDiagnosticContext({ roomStatus: 'playing', viewReady: true });
          diagLog('room:host-ready', { seat: mySeat });
        } else {
          transport.send('request-view', { seat: mySeat });
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
      transportRef.current = null;
      authoritativeRef.current = null;
    };
  }, [enabled, isHost, kind, mySeat, publish, applyAction, roomId]);

  // 访客首包可能发得太早，拿到视图前持续重试
  useEffect(() => {
    if (!enabled || !roomId || isHost) return;
    const timer = window.setInterval(() => {
      if (viewReady.current) return;
      transportRef.current?.send('request-view', { seat: mySeat });
    }, 900);
    return () => window.clearInterval(timer);
  }, [enabled, roomId, isHost, mySeat]);

  // 房主定期把局面补发给对方：即使 request-view 和首包都丢了，也能在 2.5 秒内自愈
  useEffect(() => {
    if (!enabled || !roomId || !isHost) return;
    const peer: Seat = mySeat === 0 ? 1 : 0;
    const timer = window.setInterval(() => {
      const current = authoritativeRef.current;
      if (!current) return;
      transportRef.current?.sendTo(peer, 'view', viewFor(current, peer));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [enabled, roomId, isHost, mySeat]);

  const dispatch = useCallback(
    (action: RoomAction) => {
      if (isHost) {
        applyAction(action);
        return;
      }
      transportRef.current?.send('action', { seat: mySeat, action });
    },
    [applyAction, isHost, mySeat]
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
      dispatch({
        type: 'patch',
        key,
        value: encoded,
        baseSeq: current?.seq ?? 0,
        seat: mySeat
      });
    },
    [dispatch, mySeat]
  );

  const runtime = useMemo<ModeRuntimeValue>(
    () => ({ seat: mySeat, authority: isHost, get, patch, subscribe, getVersion, snapshot: readSnapshot }),
    [mySeat, isHost, get, patch, subscribe, getVersion, readSnapshot]
  );

  const requestView = useCallback(() => {
    transportRef.current?.send('request-view', { seat: mySeat });
  }, [mySeat]);

  return { snapshot, status, presence, error, dispatch, runtime, requestView };
}
