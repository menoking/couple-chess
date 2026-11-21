import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import { getDeviceId } from './device';
import { Seat } from './types';

export type TransportKind = 'supabase' | 'local';

export interface PresenceMeta {
  seat: Seat;
  /** 上报的设备号：Presence key 用它，才能发现「两台设备抢同一座位」 */
  deviceId?: string;
  lobbyLocked?: boolean;
  themeIds?: string[];
}

export interface TransportHandlers {
  onPublic?: (kind: string, data: unknown) => void;
  onSeat?: (kind: string, data: unknown) => void;
  onPresence?: (seats: Seat[], metas?: PresenceMeta[]) => void;
}

export interface RoomTransport {
  kind: TransportKind;
  connect(): Promise<void>;
  send(kind: string, data: unknown): void;
  sendTo(seat: Seat, kind: string, data: unknown): void;
  /** 更新 Presence（锁卡包等关键状态走这条已验证可用的通道兜底） */
  track(meta: Omit<PresenceMeta, 'seat'>): void;
  close(): void;
}

const HEARTBEAT_MS = 2000;
const PRESENCE_TTL_MS = 6000;

/** 同一浏览器多标签页联机（用于本地验证，不依赖 Supabase） */
class LocalRoomTransport implements RoomTransport {
  kind: TransportKind = 'local';
  private pub: BroadcastChannel | null = null;
  private mine: BroadcastChannel | null = null;
  private peers = new Map<Seat, { time: number; meta: PresenceMeta }>();
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
      if (typeof message.seat === 'number') {
        const current = this.peers.get(message.seat);
        const payload = message.data && typeof message.data === 'object' ? message.data as Record<string, unknown> : {};
        this.peers.set(message.seat, {
          time: Date.now(),
          meta: {
            ...current?.meta,
            seat: message.seat,
            deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : current?.meta.deviceId
          }
        });
      }
      if (message.kind === 'ping') return;
      this.handlers.onPublic?.(message.kind ?? '', message.data);
    };

    this.mine.onmessage = event => {
      const message = event.data as { kind?: string; data?: unknown } | null;
      if (!message) return;
      this.handlers.onSeat?.(message.kind ?? '', message.data);
    };

    this.peers.set(this.mySeat, { time: Date.now(), meta: { seat: this.mySeat, deviceId: getDeviceId() } });
    const beat = () => {
      this.pub?.postMessage({ kind: 'ping', seat: this.mySeat, data: { deviceId: getDeviceId() } });
      const now = Date.now();
      const alive: Seat[] = [];
      const metas: PresenceMeta[] = [];
      this.peers.forEach((entry, seat) => {
        if (now - entry.time < PRESENCE_TTL_MS) {
          alive.push(seat);
          metas.push(entry.meta);
        }
      });
      if (!alive.includes(this.mySeat)) alive.push(this.mySeat);
      this.handlers.onPresence?.(alive.sort(), metas);
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
    // postMessage 是异步派发，立即 close 可能把首包一起丢掉
    window.setTimeout(() => channel.close(), 0);
  }

  track(meta: Record<string, unknown>): void {
    const current = this.peers.get(this.mySeat);
    this.peers.set(this.mySeat, {
      time: Date.now(),
      meta: { seat: this.mySeat, deviceId: getDeviceId(), ...current?.meta, ...meta }
    });
    this.pub?.postMessage({ kind: 'presence', seat: this.mySeat, data: { deviceId: getDeviceId(), ...meta } });
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
  /** 频道还没 SUBSCRIBED 时先排队，避免首包（往往就是房主的开局视图）直接丢掉 */
  private pendingSeats = new Map<Seat, Array<{ kind: string; data: unknown }>>();

  constructor(
    private roomId: string,
    private mySeat: Seat,
    private handlers: TransportHandlers
  ) {}

  async connect(): Promise<void> {
    if (!supabase) throw new Error('云服务未配置');

    const topic = `cfc-room-${this.roomId}`;
    // Presence key 必须用设备号，不能用座位号：
    // 两台设备撞同一座位时会落在同一个 key 下，后写覆盖先写，
    // 冲突永远检测不到，UI 也只会亮一个头像。
    const channel = supabase.channel(topic, {
      config: { presence: { key: getDeviceId() } }
    });

    channel.on('broadcast', { event: 'msg' }, payload => {
      const message = payload.payload as { kind?: string; data?: unknown } | undefined;
      if (!message) return;
      this.handlers.onPublic?.(message.kind ?? '', message.data);
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const seats: Seat[] = [];
      const metas: PresenceMeta[] = [];
      Object.entries(state).forEach(([deviceId, entries]) => {
        const meta = entries?.[0] ?? {};
        const rawSeat = meta.seat;
        const seat: Seat | null = rawSeat === 0 || rawSeat === 1 ? rawSeat : null;
        if (seat === null) return;
        if (!seats.includes(seat)) seats.push(seat);
        metas.push({
          seat,
          deviceId,
          lobbyLocked: meta.lobbyLocked === true,
          themeIds: Array.isArray(meta.themeIds)
            ? meta.themeIds.filter((item): item is string => typeof item === 'string')
            : []
        });
      });
      if (!seats.includes(this.mySeat)) seats.push(this.mySeat);
      this.handlers.onPresence?.(
        seats.sort(),
        metas.sort((a, b) => a.seat - b.seat)
      );
    });

    this.publicChannel = channel;
    // subscribe() 本身不返回 Promise，必须等 SUBSCRIBED 回调，否则紧接着的 send 会丢
    await new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      channel.subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ seat: this.mySeat });
          // 先把自己点亮，对方的头像由 presence sync 补上，避免开场两个人都是灰的
          this.handlers.onPresence?.([this.mySeat]);
          finish();
        }
      });
      window.setTimeout(finish, 6000);
    });

    // 自己的收件频道
    const mineTopic = `cfc-room-${this.roomId}-s${this.mySeat}`;
    const mine = supabase.channel(mineTopic, { config: { broadcast: { self: true } } });
    mine.on('broadcast', { event: 'msg' }, payload => {
      const message = payload.payload as { kind?: string; data?: unknown } | undefined;
      if (!message) return;
      this.handlers.onSeat?.(message.kind ?? '', message.data);
    });
    await new Promise<void>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      mine.subscribe(status => {
        if (status === 'SUBSCRIBED') finish();
      });
      window.setTimeout(finish, 6000);
    });
    this.seatChannels.set(this.mySeat, mine);
  }

  private channelFor(seat: Seat): RealtimeChannel | null {
    if (!supabase) return null;
    const existing = this.seatChannels.get(seat);
    if (existing) return existing;
    const channel = supabase.channel(`cfc-room-${this.roomId}-s${seat}`, {
      config: { broadcast: { self: true } }
    });
    this.pendingSeats.set(seat, []);
    channel.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      const queued = this.pendingSeats.get(seat) ?? [];
      this.pendingSeats.delete(seat);
      queued.forEach(item => {
        channel.send({ type: 'broadcast', event: 'msg', payload: item });
      });
    });
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
    const channel = this.channelFor(seat);
    if (!channel) return;
    // 频道刚创建、还没订阅完成：先入队，SUBSCRIBED 后自动补发
    const queue = this.pendingSeats.get(seat);
    if (queue) {
      queue.push({ kind, data });
      return;
    }
    channel.send({
      type: 'broadcast',
      event: 'msg',
      payload: { kind, data }
    });
  }

  track(meta: Record<string, unknown>): void {
    void this.publicChannel?.track({ seat: this.mySeat, ...meta });
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
    this.pendingSeats.clear();
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
