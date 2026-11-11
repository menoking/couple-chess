import { useEffect, useRef, useState } from 'react';
import { supabase } from './client';
import { Theme } from '../types';

export interface CloudSyncState {
  status: 'idle' | 'pushing' | 'pulling' | 'error';
  lastSyncedAt: string | null;
  error: string | null;
}

const pushKey = (spaceId: string) => `cfc:themes:push:${spaceId}`;

/**
 * 题库云同步：登录后拉取一次；本地改动防抖 2.5s 推送。
 * 冲突策略为「后写覆盖」，因此约定同一时间只在一台设备上编辑题库。
 */
export function useCloudSync(input: {
  spaceId: string | null;
  themes: Theme[];
  onRemote: (themes: Theme[]) => void;
  enabled: boolean;
}): CloudSyncState {
  const { spaceId, themes, onRemote, enabled } = input;
  const themesRef = useRef(themes);
  const skipNextPush = useRef(true);
  const [status, setStatus] = useState<CloudSyncState['status']>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  themesRef.current = themes;

  useEffect(() => {
    if (!enabled || !spaceId || !supabase) return;
    let cancelled = false;
    setStatus('pulling');

    (async () => {
      const { data, error: fetchError } = await supabase
        .from('space_data')
        .select('themes, updated_at')
        .eq('space_id', spaceId)
        .maybeSingle();

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setStatus('error');
        return;
      }

      const localPushAt = Number(window.localStorage.getItem(pushKey(spaceId)) ?? 0);

      if (data?.themes) {
        const remoteAt = Date.parse(String(data.updated_at));
        if (remoteAt > localPushAt) {
          skipNextPush.current = true;
          onRemote(data.themes as Theme[]);
          setLastSyncedAt(String(data.updated_at));
          window.localStorage.setItem(pushKey(spaceId), String(remoteAt));
        }
      } else {
        // 云端还没有数据：把本地题库推上去作为基线
        const now = new Date().toISOString();
        await supabase.from('space_data').upsert({
          space_id: spaceId,
          themes: themesRef.current,
          updated_at: now
        });
        window.localStorage.setItem(pushKey(spaceId), String(Date.parse(now)));
        setLastSyncedAt(now);
        skipNextPush.current = false;
      }

      setStatus('idle');
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, onRemote, spaceId]);

  useEffect(() => {
    if (!enabled || !spaceId || !supabase) return;
    if (skipNextPush.current) {
      skipNextPush.current = false;
      return;
    }

    const client = supabase;
    if (!client) return;

    const timer = window.setTimeout(async () => {
      setStatus('pushing');
      const now = new Date().toISOString();
      const { error: upsertError } = await client.from('space_data').upsert({
        space_id: spaceId,
        themes,
        updated_at: now
      });
      if (upsertError) {
        setError(upsertError.message);
        setStatus('error');
        return;
      }
      window.localStorage.setItem(pushKey(spaceId), String(Date.parse(now)));
      setLastSyncedAt(now);
      setStatus('idle');
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [enabled, spaceId, themes]);

  return { status, lastSyncedAt, error };
}
