import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import { Seat } from './types';

export type TransportKind = 'supabase' | 'local';

export interface TransportHandlers {
  onPublic?: (kind: string, data: unknown) => void;
  onSeat?: (kind: string, data: unknown) => void;
  onPresence?: (seats: Seat[]) => void;
}

export interface RoomTransport {
  kind: TransportKind;
  connect(): Promise<void>;
  send(kind: string, data: unknown): void;
  sendTo(seat: Seat, kind: string, data: unknown): void;
  close(): void;
}

const HEARTBEAT_MS = 2000;
const PRESENCE_TTL_MS = 6000;

/** 同一浏览器多标签页联机（用于本地验证，不依赖 Supabase） */
class LocalRoomTransport implements RoomTransport {
  kind: TransportKind = 'local';
  private pub: BroadcastChannel | null = null;
  private mine: BroadcastChannel | null = null;
  private peers = new Map<Seat, number>();
  private heartbeat: number | null = null;

  constructor(
    private roomId: string,
    private mySeat: Seat,
    private handlers: TransportHandlers
  ) {}

  async connect(): Promise<void> {
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('当前浏览器不支持本地联机测试');
    }
    this.pub = new BroadcastChannel(`cfc-room:${this.roomId}`);
    this.mine = new BroadcastChannel(`cfc-room:${this.roomId}:s${this.mySeat}`);

    this.pub.onmessage = event => {
      const message = event.data as { kind?: string; data?: unknown; seat?: Seat } | null;
      if (!message) return;
      if (typeof message.seat === 'number') this.peers.set(message.seat, Date.now());
      if (message.kind === 'ping') return;
      this.handlers.onPublic?.(message.kind ?? '', message.data);
    };

    this.mine.onmessage = event => {
      const message = event.data as { kind?: string; data?: unknown } | null;
      if (!message) return;
      this.handlers.onSeat?.(message.kind ?? '', message.data);
    };

    this.peers.set(this.mySeat, Date.now());
    const beat = () => {
      this.pub?.postMessage({ kind: 'ping', seat: this.mySeat });
      const now = Date.now();
      const alive: Seat[] = [];
      this.peers.forEach((time, seat) => {
        if (now - time < PRESENCE_TTL_MS) alive.push(seat);
      });
      if (!alive.includes(this.mySeat)) alive.push(this.mySeat);
      this.handlers.onPresence?.(alive.sort());
    };
    beat();
    this.heartbeat = window.setInterval(beat, HEARTBEAT_MS);
  }

  send(kind: string, data: unknown): void {
    this.pub?.postMessage({ kind, data, seat: this.mySeat });
  }

  sendTo(seat: Seat, kind: string, data: unknown): void {
    if (seat === this.mySeat) {
      this.handlers.onSeat?.(kind, data);
      return;
    }
    const channel = new BroadcastChannel(`cfc-room:${this.roomId}:s${seat}`);
    channel.postMessage({ kind, data });
    channel.close();
  }

  close(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.pub?.close();
    this.mine?.close();
    this.pub = null;
    this.mine = null;
  }
}

/** Supabase Realtime 联机（跨设备） */
class SupabaseRoomTransport implements RoomTransport {
  kind: TransportKind = 'supabase';
  private publicChannel: RealtimeChannel | null = null;
  private seatChannels = new Map<Seat, RealtimeChannel>();

  constructor(
    private roomId: string,
    private mySeat: Seat,
    private handlers: TransportHandlers
  ) {}

  async connect(): Promise<void> {
    if (!supabase) throw new Error('云服务未配置');

    const topic = `cfc-room-${this.roomId}`;
    const channel = supabase.channel(topic, {
      config: { presence: { key: `s${this.mySeat}` } }
    });

    channel.on('broadcast', { event: 'msg' }, payload => {
      const message = payload.payload as { kind?: string; data?: unknown } | undefined;
      if (!message) return;
      this.handlers.onPublic?.(message.kind ?? '', message.data);
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      const seats: Seat[] = [];
      Object.keys(state).forEach(key => {
        const seat = Number(key.replace('s', ''));
        if (seat === 0 || seat === 1) seats.push(seat);
      });
      if (!seats.includes(this.mySeat)) seats.push(this.mySeat);
      this.handlers.onPresence?.(seats.sort());
    });

    await channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ seat: this.mySeat });
      }
    });
    this.publicChannel = channel;

    // 自己的收件频道
    const mineTopic = `cfc-room-${this.roomId}-s${this.mySeat}`;
    const mine = supabase.channel(mineTopic, { config: { broadcast: { self: true } } });
    mine.on('broadcast', { event: 'msg' }, payload => {
      const message = payload.payload as { kind?: string; data?: unknown } | undefined;
      if (!message) return;
      this.handlers.onSeat?.(message.kind ?? '', message.data);
    });
    await mine.subscribe();
    this.seatChannels.set(this.mySeat, mine);
  }

  private channelFor(seat: Seat): RealtimeChannel | null {
    if (!supabase) return null;
    const existing = this.seatChannels.get(seat);
    if (existing) return existing;
    const channel = supabase.channel(`cfc-room-${this.roomId}-s${seat}`, {
      config: { broadcast: { self: true } }
    });
    channel.subscribe();
    this.seatChannels.set(seat, channel);
    return channel;
  }

  send(kind: string, data: unknown): void {
    this.publicChannel?.send({
      type: 'broadcast',
      event: 'msg',
      payload: { kind, data }
    });
  }

  sendTo(seat: Seat, kind: string, data: unknown): void {
    this.channelFor(seat)?.send({
      type: 'broadcast',
      event: 'msg',
      payload: { kind, data }
    });
  }

  close(): void {
    const client = supabase;
    if (client) {
      this.seatChannels.forEach(channel => {
        client.removeChannel(channel);
      });
      if (this.publicChannel) client.removeChannel(this.publicChannel);
    }
    this.seatChannels.clear();
    this.publicChannel = null;
  }
}

export function createTransport(
  kind: TransportKind,
  roomId: string,
  mySeat: Seat,
  handlers: TransportHandlers
): RoomTransport {
  return kind === 'supabase'
    ? new SupabaseRoomTransport(roomId, mySeat, handlers)
    : new LocalRoomTransport(roomId, mySeat, handlers);
}
