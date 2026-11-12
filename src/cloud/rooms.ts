import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './client';
import { SpaceInfo } from './types';
import { getDeviceId } from './device';
import { OnlineModeKey } from './games/adapters';

export interface RoomTicket {
  roomId: string;
  mode: OnlineModeKey;
  isHost: boolean;
}

export interface RoomAnnounce {
  roomId: string;
  mode: OnlineModeKey;
  fromDevice?: string;
}

export function roomIdOf(spaceId: string, mode: OnlineModeKey): string {
  return `${spaceId}-${mode}`;
}

const SPACE_ROOM_TOPIC = (spaceId: string) => `cfc-space-rooms-${spaceId}`;
const ELECTION_TOPIC = (roomId: string) => `cfc-ele-${roomId}`;

type RoomRole = 'host' | 'guest' | 'peer';

export interface RoomPresence {
  deviceId: string;
  role: RoomRole;
  at: number;
}

/** 每台设备在整局期间都保持自己的选举频道，房主离开后房间状态仍然可读。 */
const activeChannels = new Map<string, RealtimeChannel>();

function readPresence(channel: RealtimeChannel): RoomPresence[] {
  const state = channel.presenceState() as Record<string, Array<{ role?: string; at?: number }>>;
  const result: RoomPresence[] = [];
  Object.entries(state ?? {}).forEach(([deviceId, metas]) => {
    const meta = metas?.[0] ?? {};
    result.push({
      deviceId,
      role: meta.role === 'host' || meta.role === 'guest' ? meta.role : 'peer',
      at: typeof meta.at === 'number' ? meta.at : 0
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

/**
 * 进入「账号 + 玩法」这唯一一间房，并决定我是房主还是访客。
 *
 * 规则（关键是后来者绝不抢房主）：
 * 1. 频道里已经有人标记成 host → 我是访客，直接加入他的房间；
 * 2. 只剩访客、房主刚走 → 我接手当房主；
 * 3. 两台设备同时进 → 按「进入时间 + 设备 ID」排序，最早的那台当房主，另一台当访客。
 * 当选结果会立刻 track 回 Presence，后来者一眼就能看到 host。
 */
export async function enterOnlineRoom(
  space: SpaceInfo,
  mode: OnlineModeKey
): Promise<RoomTicket | null> {
  const client = supabase;
  if (!client) return null;

  const roomId = roomIdOf(space.id, mode);
  const myId = getDeviceId();
  const at = Date.now();

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
      if (status === 'SUBSCRIBED') {
        await channel.track({ role: 'peer', at });
        finish();
      }
    });
    window.setTimeout(finish, 1500);
  });

  activeChannels.set(roomId, channel);
  // 等 Presence 把同房间的其它设备同步过来
  await new Promise<void>(resolve => window.setTimeout(resolve, 1100));

  const isHost = decideHost(readPresence(channel), myId, at);
  await channel.track({ role: isHost ? 'host' : 'guest', at });

  return { roomId, mode, isHost };
}

export async function leaveOnlineRoom(roomId: string): Promise<void> {
  const client = supabase;
  const channel = activeChannels.get(roomId);
  if (!channel) return;
  activeChannels.delete(roomId);
  if (client) await client.removeChannel(channel);
}

/**
 * 同一间屋子只开一个频道：房主用它广播，另一方用它接收。
 * 两个同名的 Supabase 频道会互相挤掉，所以这里统一复用。
 */
const roomListeners = new Set<(room: RoomAnnounce) => void>();
let sharedChannel: RealtimeChannel | null = null;
let sharedSpaceId: string | null = null;
let sharedSubscribed = false;

function getRoomChannel(client: NonNullable<typeof supabase>, spaceId: string): RealtimeChannel {
  if (sharedChannel && sharedSpaceId === spaceId) return sharedChannel;
  if (sharedChannel) void client.removeChannel(sharedChannel);

  sharedSubscribed = false;
  const channel = client.channel(SPACE_ROOM_TOPIC(spaceId));
  channel.on('broadcast', { event: 'room-open' }, payload => {
    const data = payload.payload as RoomAnnounce | undefined;
    if (!data || data.fromDevice === getDeviceId()) return;
    roomListeners.forEach(listener => listener(data));
  });
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') sharedSubscribed = true;
  });
  sharedChannel = channel;
  sharedSpaceId = spaceId;
  return channel;
}

function broadcastRoom(
  channel: RealtimeChannel,
  roomId: string,
  mode: OnlineModeKey
): void {
  if (!sharedSubscribed) return;
  channel.send({
    type: 'broadcast',
    event: 'room-open',
    payload: { roomId, mode, fromDevice: getDeviceId() }
  });
}

/**
 * 房主持续广播「我在这个房间」，直到退出房间。
 * 之前只播一次，另一台设备晚打开页面就永远收不到，看起来就像匹配不上。
 */
export function startRoomHeartbeat(
  space: SpaceInfo,
  roomId: string,
  mode: OnlineModeKey
): () => void {
  const client = supabase;
  if (!client) return () => undefined;

  const channel = getRoomChannel(client, space.id);
  const send = () => broadcastRoom(channel, roomId, mode);
  const timer = window.setInterval(send, 2500);

  return () => window.clearInterval(timer);
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
