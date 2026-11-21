import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameMode } from '../types';
import type { Role, Seat } from '../rules/types';
import { assignSeats, otherSeat, roleOfSeat, seatOfRole } from '../rules/identity';
import { supabase } from './client';
import { SpaceInfo } from './types';
import { getDeviceId } from './device';
import { diagLog } from './diagnostics';

export interface RoomTicket {
  roomId: string;
  mode: GameMode;
  isHost: boolean;
  /** 本机实际坐的座位（已处理撞座） */
  mySeat: Seat;
  /** 权威端（房主）坐的座位 */
  hostSeat: Seat;
  /** 本机实际生效的性别（撞座时可能被调整） */
  myRole: Role;
  hostRole: Role;
}

export interface RoomAnnounce {
  roomId: string;
  mode: GameMode;
  hostRole?: Role;
  fromDevice?: string;
}

export function roomIdOf(spaceId: string, mode: GameMode): string {
  return `${spaceId}-${mode}`;
}

const SPACE_ROOM_TOPIC = (spaceId: string) => `cfc-space-rooms-${spaceId}`;
const ELECTION_TOPIC = (roomId: string) => `cfc-ele-${roomId}`;

type RoomRole = 'host' | 'guest' | 'peer';

export interface RoomPresence {
  deviceId: string;
  role: RoomRole;
  at: number;
  gender?: Role;
  /** 设备实际坐的座位，后来者据此避开撞座 */
  seat?: Seat;
}

/** 每台设备在整局期间都保持自己的选举频道，房主离开后房间状态仍然可读。 */
const activeChannels = new Map<string, RealtimeChannel>();

function readPresence(channel: RealtimeChannel): RoomPresence[] {
  const state = channel.presenceState() as Record<string, Array<{ role?: string; at?: number; gender?: string; seat?: number }>>;
  const result: RoomPresence[] = [];
  Object.entries(state ?? {}).forEach(([deviceId, metas]) => {
    const meta = metas?.[0] ?? {};
    result.push({
      deviceId,
      role: meta.role === 'host' || meta.role === 'guest' ? meta.role : 'peer',
      at: typeof meta.at === 'number' ? meta.at : 0,
      gender: meta.gender === 'male' || meta.gender === 'female' ? meta.gender : undefined,
      seat: meta.seat === 0 || meta.seat === 1 ? meta.seat : undefined
    });
  });
  return result;
}

const rankOf = (entry: RoomPresence) => `${String(entry.at).padStart(16, '0')}#${entry.deviceId}`;

/** 纯函数：根据在场设备决定我是否是房主，便于回归验证「后来者绝不抢房主」。 */
export function decideHost(peers: RoomPresence[], myId: string, at: number): boolean {
  const everyone = [...peers];
  if (!everyone.some(entry => entry.deviceId === myId)) {
    everyone.push({ deviceId: myId, role: 'peer', at });
  }
  const earliest = everyone.slice().sort((a, b) => rankOf(a).localeCompare(rankOf(b)))[0];
  const others = peers.filter(entry => entry.deviceId !== myId);

  if (others.some(entry => entry.role === 'host')) return false;
  if (others.length > 0 && others.every(entry => entry.role === 'guest')) return true;
  return earliest?.deviceId === myId;
}

/** 从在场设备里找到房主的性别；找不到时以我自己的性别兜底。 */
/** Presence 事件驱动等待：看到对方立即返回；无人时只留一个很短的稳定窗口。 */
async function waitForPresence(
  channel: RealtimeChannel,
  minPeers: number,
  timeoutMs: number,
  settleMs = 120
): Promise<RoomPresence[]> {
  const initial = readPresence(channel);
  if (initial.length >= minPeers) return initial;
  return new Promise(resolve => {
    let done = false;
    let settleTimer: number | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      resolve(readPresence(channel));
    };
    const scheduleSettle = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(finish, settleMs);
    };
    channel.on('presence', { event: 'sync' }, () => {
      if (readPresence(channel).length >= minPeers) finish();
      else scheduleSettle();
    });
    // 如果 track 的 sync 在注册监听前已经到达，也不会退回过去的 600ms 轮询。
    scheduleSettle();
    window.setTimeout(finish, timeoutMs);
  });
}

/**
 * 进入「账号 + 玩法」这唯一一间房，并决定我是房主还是访客。
 * 规则：先到先当房主，后来者无条件加入；性别随 Presence 广播，供座位分配用。
 */
export async function enterOnlineRoom(
  space: SpaceInfo,
  mode: GameMode,
  myRole: Role,
  forceHost = false
): Promise<RoomTicket | null> {
  const client = supabase;
  if (!client) {
    diagLog('room:no-client', { mode });
    return null;
  }

  const roomId = roomIdOf(space.id, mode);
  const myId = getDeviceId();
  const at = Date.now();
  diagLog('room:begin', { room: roomId.slice(-8), device: myId.slice(0, 8), gender: myRole });

  await leaveOnlineRoom(roomId);

  const channel = client.channel(ELECTION_TOPIC(roomId), {
    config: { presence: { key: myId } }
  });

  await new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    channel.subscribe(async status => {
      diagLog('room:subscribe', { status, ms: Date.now() - at });
      if (status === 'SUBSCRIBED') {
        await channel.track({ role: 'peer', at, gender: myRole });
        finish();
      }
    });
    window.setTimeout(finish, 1500);
  });

  activeChannels.set(roomId, channel);
  const peers = await waitForPresence(channel, 2, 600, 140);
  // forceHost：对方已离线时由本机接管，避免永远停在「正在连接房间」
  let isHost = forceHost || decideHost(peers, myId, at);

  // 房主坐自己性别对应的座位；访客优先自己座位，只有撞座才换到另一端。
  // 旧版本 Presence 可能没有 seat，用 gender 兜底，再不行就占另一个座。
  const preferred = seatOfRole(myRole);
  const hostSeatOf = (entry: RoomPresence | undefined, fallback: Seat): Seat =>
    entry?.seat !== undefined
      ? entry.seat
      : entry?.gender
        ? seatOfRole(entry.gender)
        : fallback;

  const hostMeta = peers.find(entry => entry.role === 'host' && entry.deviceId !== myId);
  let hostSeat: Seat = isHost ? preferred : hostSeatOf(hostMeta, otherSeat(preferred));
  let seats = assignSeats({ myRole, hostSeat, isHost });

  await channel.track({
    role: isHost ? 'host' : 'guest',
    at,
    gender: seats.effectiveRole,
    seat: seats.mySeat
  });

  // 二次仲裁：两端几乎同时进房时，Presence 可能还没互相同步，会双双自认房主。
  // 只有「自认房主」才需要再确认一轮；访客直接返回，省掉一次等待。
  let settledPeers = peers;
  if (isHost) {
    settledPeers = await waitForPresence(channel, 2, 450, 100);
  }
  const rivalHost = settledPeers
    .filter(entry => entry.role === 'host' && entry.deviceId !== myId)
    .sort((a, b) => rankOf(a).localeCompare(rankOf(b)))[0];
  if (isHost && rivalHost && rankOf(rivalHost) < rankOf({ deviceId: myId, role: 'host', at })) {
    isHost = false;
    hostSeat = hostSeatOf(rivalHost, otherSeat(preferred));
    seats = assignSeats({ myRole, hostSeat, isHost });
    await channel.track({
      role: 'guest',
      at,
      gender: seats.effectiveRole,
      seat: seats.mySeat
    });
    diagLog('room:demoted', { rival: rivalHost.deviceId.slice(0, 8), mySeat: seats.mySeat });
  }

  diagLog('room:decided', {
    ms: Date.now() - at,
    peers: settledPeers.map(entry => `${entry.deviceId.slice(0, 8)}:${entry.role}:${entry.gender ?? '-'}:${entry.seat ?? '-'}`),
    isHost,
    mySeat: seats.mySeat,
    hostSeat: seats.hostSeat,
    flipped: seats.flipped
  });
  diagLog('room:done', { ms: Date.now() - at });

  return {
    roomId,
    mode,
    isHost,
    mySeat: seats.mySeat,
    hostSeat: seats.hostSeat,
    myRole: seats.effectiveRole,
    hostRole: roleOfSeat(seats.hostSeat)
  };
}

export async function leaveOnlineRoom(roomId: string): Promise<void> {
  const client = supabase;
  const channel = activeChannels.get(roomId);
  if (!channel) return;
  activeChannels.delete(roomId);
  if (client) await client.removeChannel(channel);
}

/** 同一间屋子只开一个频道：房主用它广播，另一方用它接收。 */
const roomListeners = new Set<(room: RoomAnnounce) => void>();
let sharedChannel: RealtimeChannel | null = null;
let sharedSpaceId: string | null = null;
let sharedSubscribed = false;
const pendingRoomAnnouncements = new Map<string, RoomAnnounce>();

function getRoomChannel(client: NonNullable<typeof supabase>, spaceId: string): RealtimeChannel {
  if (sharedChannel && sharedSpaceId === spaceId) return sharedChannel;
  if (sharedChannel) void client.removeChannel(sharedChannel);

  sharedSubscribed = false;
  pendingRoomAnnouncements.clear();
  const channel = client.channel(SPACE_ROOM_TOPIC(spaceId));
  channel.on('broadcast', { event: 'room-open' }, payload => {
    const data = payload.payload as RoomAnnounce | undefined;
    if (!data || data.fromDevice === getDeviceId()) return;
    roomListeners.forEach(listener => listener(data));
  });
  channel.subscribe(status => {
    if (status !== 'SUBSCRIBED') return;
    sharedSubscribed = true;
    // startRoomHeartbeat 可能早于 SUBSCRIBED；订阅成功后立即补发，不再等下一次心跳。
    pendingRoomAnnouncements.forEach(announce => {
      channel.send({
        type: 'broadcast',
        event: 'room-open',
        payload: { ...announce, fromDevice: getDeviceId() }
      });
    });
    pendingRoomAnnouncements.clear();
  });
  sharedChannel = channel;
  sharedSpaceId = spaceId;
  return channel;
}

function broadcastRoom(channel: RealtimeChannel, announce: RoomAnnounce): void {
  if (!sharedSubscribed) {
    pendingRoomAnnouncements.set(announce.roomId, announce);
    return;
  }
  channel.send({
    type: 'broadcast',
    event: 'room-open',
    payload: { ...announce, fromDevice: getDeviceId() }
  });
}

export function startRoomHeartbeat(
  space: SpaceInfo,
  roomId: string,
  mode: GameMode,
  hostRole: Role = 'male'
): () => void {
  const client = supabase;
  if (!client) return () => undefined;

  const channel = getRoomChannel(client, space.id);
  const send = () => broadcastRoom(channel, { roomId, mode, hostRole });
  send();
  const timer = window.setInterval(send, 1500);

  return () => {
    window.clearInterval(timer);
    pendingRoomAnnouncements.delete(roomId);
  };
}

/** 常驻监听别的设备「我来玩了」的通知 */
export function subscribeSpaceRooms(
  space: SpaceInfo,
  onAnnounce: (room: RoomAnnounce) => void
): () => void {
  const client = supabase;
  if (!client) return () => undefined;

  getRoomChannel(client, space.id);
  roomListeners.add(onAnnounce);

  return () => {
    roomListeners.delete(onAnnounce);
  };
}
