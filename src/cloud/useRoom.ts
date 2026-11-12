import { useCallback, useEffect, useRef, useState } from 'react';
import { GameAdapter, OnlineCard, RoomPlayer, Seat } from './types';
import { RoomTransport, TransportKind, createTransport } from './transport';

export interface UseRoomInput<S, A, V> {
  adapter: GameAdapter<S, A, V>;
  roomId: string | null;
  mySeat: Seat;
  hostSeat: Seat;
  players: RoomPlayer[];
  /** 可选任务卡池，只有房主设备的生效，写进初始 state 后双方共用 */
  cardPool?: OnlineCard[];
  kind: TransportKind;
  enabled: boolean;
}

export interface UseRoomResult<V, A> {
  status: 'idle' | 'connecting' | 'playing' | 'error';
  view: V | null;
  presence: Seat[];
  error: string | null;
  dispatch: (action: A) => void;
  requestView: () => void;
}

/**
 * 房主裁判模型：房主持有权威 state，收到动作后判定，再把「各自的视图」私发到座位频道。
 * 这样私密信息（如骰子）不会广播给对手。
 */
export function useRoom<S, A, V>(input: UseRoomInput<S, A, V>): UseRoomResult<V, A> {
  const { adapter, roomId, mySeat, hostSeat, players, cardPool, kind, enabled } = input;

  const [status, setStatus] = useState<UseRoomResult<V, A>['status']>('idle');
  const [view, setView] = useState<V | null>(null);
  const [presence, setPresence] = useState<Seat[]>([]);
  const [error, setError] = useState<string | null>(null);

  const transportRef = useRef<RoomTransport | null>(null);
  const stateRef = useRef<S | null>(null);
  const viewReadyRef = useRef(false);
  const lastPresenceRef = useRef('');
  // players 每次渲染都是新数组，用 ref 避免它触发重连
  const playersRef = useRef(players);
  playersRef.current = players;
  // 题库可能随云同步变化，用 ref 读取，避免触发重连导致对局重置
  const cardPoolRef = useRef(cardPool);
  cardPoolRef.current = cardPool;
  const isHost = mySeat === hostSeat;

  const publish = useCallback(
    (state: S) => {
      const transport = transportRef.current;
      viewReadyRef.current = true;
      setView(adapter.viewFor(state, mySeat));
      if (!transport) return;
      ([0, 1] as Seat[]).forEach(seat => {
        transport.sendTo(seat, 'view', adapter.viewFor(state, seat));
      });
    },
    [adapter, mySeat]
  );

  const applyAction = useCallback(
    (seat: Seat, action: A) => {
      if (!isHost) return;
      const current = stateRef.current;
      if (!current) return;
      const next = adapter.apply(current, action, seat);
      if (next === current) return;
      stateRef.current = next;
      publish(next);
    },
    [adapter, isHost, publish]
  );

  useEffect(() => {
    if (!enabled || !roomId) {
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('connecting');
    setError(null);
    setView(null);
    viewReadyRef.current = false;
    lastPresenceRef.current = '';

    const transport = createTransport(kind, roomId, mySeat, {
      onPublic: (messageKind, data) => {
        if (cancelled) return;
        if (!isHost) return;
        if (messageKind === 'action') {
          const envelope = data as { seat?: Seat; action?: A };
          if (typeof envelope?.seat !== 'number') return;
          applyAction(envelope.seat, envelope.action as A);
          return;
        }
        if (messageKind === 'request-view') {
          const current = stateRef.current;
          if (current) publish(current);
        }
      },
      onSeat: (messageKind, data) => {
        if (cancelled) return;
        if (messageKind === 'view') {
          viewReadyRef.current = true;
          setView(data as V);
          setStatus('playing');
        }
      },
      onPresence: seats => {
        if (cancelled) return;
        setPresence(seats);
        // 有新设备上线时，房主把当前局面补发一次，后来者不必等下一次操作
        const key = [...seats].sort().join(',');
        if (isHost && key !== lastPresenceRef.current && stateRef.current) {
          lastPresenceRef.current = key;
          publish(stateRef.current);
        }
      }
    });

    transportRef.current = transport;

    (async () => {
      try {
        await transport.connect();
        if (cancelled) return;
        if (isHost) {
          const initial = adapter.createInitial(playersRef.current, cardPoolRef.current);
          stateRef.current = initial;
          publish(initial);
          setStatus('playing');
        } else {
          transport.send('request-view', { seat: mySeat });
          setStatus('connecting');
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '联机初始化失败');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      transport.close();
      transportRef.current = null;
      stateRef.current = null;
    };
  }, [adapter, enabled, isHost, kind, mySeat, publish, roomId, applyAction]);

  // 访客可能在房主订阅公共频道之前就发出了 request-view，消息会丢。
  // 拿到第一份视图前持续重试，保证「后进房间」一定能同步到房主的局面。
  useEffect(() => {
    if (!enabled || !roomId || isHost) return;
    const timer = window.setInterval(() => {
      if (viewReadyRef.current) return;
      transportRef.current?.send('request-view', { seat: mySeat });
    }, 900);
    return () => window.clearInterval(timer);
  }, [enabled, roomId, isHost, mySeat]);

  const dispatch = useCallback(
    (action: A) => {
      if (isHost) {
        applyAction(mySeat, action);
        return;
      }
      transportRef.current?.send('action', { seat: mySeat, action });
    },
    [applyAction, isHost, mySeat]
  );

  const requestView = useCallback(() => {
    transportRef.current?.send('request-view', { seat: mySeat });
  }, [mySeat]);

  return { status, view, presence, error, dispatch, requestView };
}
