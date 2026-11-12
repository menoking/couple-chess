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

/**
 * 房主选举：不依赖任何数据表。
 * 每台设备进入时加入房间的「在场频道」，等 900ms 看还有谁在：
 * - 只有自己 → 我是房主
 * - 有别人 → 按设备 ID 排序，最小的当房主（同时进入也不会打架）
 * 频道在整局期间保持打开，所以后来者一定能看到房主；房主离开后，剩下的人自动成为房主。
 */
const activeChannels = new Map<string, RealtimeChannel>();

export async function enterOnlineRoom(
  space: SpaceInfo,
  mode: OnlineModeKey,
  forceHost = false
): Promise<RoomTicket | null> {
  const client = supabase;
  if (!client) return null;

  const roomId = roomIdOf(space.id, mode);
  const myId = getDeviceId();

  await leaveOnlineRoom(roomId);

  const channel = client.channel(`cfc-ele-${roomId}`, {
    config: { presence: { key: myId } }
  });

  const seen = new Set<string>();
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState() as Record<string, unknown>;
    seen.clear();
    Object.keys(state).forEach(key => seen.add(key));
  });

  await new Promise<void>(resolve => {
    channel.subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ at: Date.now() });
        resolve();
      }
    });
    window.setTimeout(resolve, 1500);
  });

  activeChannels.set(roomId, channel);
  window.setTimeout(() => {
    const state = channel.presenceState() as Record<string, unknown>;
    seen.clear();
    Object.keys(state).forEach(key => seen.add(key));
  }, 0);

  await new Promise(resolve => window.setTimeout(resolve, 900));

  const others = [...seen].filter(id => id !== myId);
  const isHost = forceHost || others.length === 0 || [...seen].sort()[0] === myId;

  return { roomId, mode, isHost };
}

export async function leaveOnlineRoom(roomId: string): Promise<void> {
  const client = supabase;
  const channel = activeChannels.get(roomId);
  if (!channel) return;
  activeChannels.delete(roomId);
  if (client) await client.removeChannel(channel);
}

/** 通知同一间屋子的另一台设备「我来玩了」 */
export async function announceRoom(space: SpaceInfo, roomId: string, mode: OnlineModeKey): Promise<void> {
  const client = supabase;
  if (!client) return;
  const channel = client.channel(`cfc-space-${space.id}`);
  await channel.subscribe();
  channel.send({
    type: 'broadcast',
    event: 'room-open',
    payload: { roomId, mode, fromDevice: getDeviceId() }
  });
  window.setTimeout(() => {
    void client.removeChannel(channel);
  }, 1200);
}

/** 常驻监听别人的「我来玩了」通知 */
export function subscribeSpaceRooms(
  space: SpaceInfo,
  onAnnounce: (room: RoomAnnounce) => void
): () => void {
  const client = supabase;
  if (!client) return () => undefined;

  const channel = client.channel(`cfc-space-${space.id}`);
  channel.on('broadcast', { event: 'room-open' }, payload => {
    const data = payload.payload as RoomAnnounce | undefined;
    if (!data) return;
    if (data.fromDevice === getDeviceId()) return;
    onAnnounce(data);
  });
  channel.subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
