import { supabase } from './client';
import { SpaceInfo } from './types';
import { getDeviceId } from './device';
import { OnlineModeKey } from './games/adapters';

export interface RoomTicket {
  roomId: string;
  mode: OnlineModeKey;
  isHost: boolean;
}

export function roomIdOf(spaceId: string, mode: OnlineModeKey): string {
  return `${spaceId}-${mode}`;
}

/**
 * 进房间：先插 rooms 行，谁先插入谁是房主。
 * 主键冲突说明对方已经先到了，直接读回 host_device 判定身份。
 */
export async function enterOnlineRoom(
  space: SpaceInfo,
  mode: OnlineModeKey,
  forceHost = false
): Promise<RoomTicket | null> {
  const client = supabase;
  if (!client) return null;

  const roomId = roomIdOf(space.id, mode);
  const device = getDeviceId();

  const { error: insertError } = await client
    .from('rooms')
    .insert({ id: roomId, space_id: space.id, host_device: device });

  if (insertError && insertError.code !== '23505') {
    const missingTable =
      insertError.code === '42P01' ||
      insertError.code === 'PGRST205' ||
      /could not find the table|does not exist/i.test(insertError.message);
    throw new Error(
      missingTable
        ? 'rooms 表还没建：去 Supabase SQL Editor 执行 supabase/schema.sql，然后执行 notify pgrst, \'reload schema\''
        : insertError.message
    );
  }

  if (forceHost) {
    await client
      .from('rooms')
      .update({ host_device: device, updated_at: new Date().toISOString() })
      .eq('id', roomId);
  }

  const { data } = await client.from('rooms').select('host_device').eq('id', roomId).maybeSingle();
  return { roomId, mode, isHost: data?.host_device === device };
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

export interface RoomAnnounce {
  roomId: string;
  mode: OnlineModeKey;
  fromDevice?: string;
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
