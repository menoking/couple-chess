import { useEffect, useRef } from 'react';
import { supabase } from './client';
import { SpaceInfo } from './types';
import { OnlineRoomInfo } from './OnlinePlayView';

/**
 * 常驻监听小屋频道：不管云面板是否打开，都能收到对方的联机邀请。
 * 发送方用自己的座位号标记；自己发的邀请会被过滤掉。
 */
export function useSpaceInvite(
  space: SpaceInfo | null,
  onInvite: (room: OnlineRoomInfo) => void
): void {
  const callbackRef = useRef(onInvite);
  callbackRef.current = onInvite;

  useEffect(() => {
    if (!space) return;
    const client = supabase;
    if (!client) return;

    const channel = client.channel(`cfc-space-${space.id}`);
    channel.on('broadcast', { event: 'invite' }, payload => {
      const data = payload.payload as OnlineRoomInfo | undefined;
      if (!data || data.hostSeat === space.seat) return;
      callbackRef.current(data);
    });
    channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [space]);
}
