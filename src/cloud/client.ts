import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 没配置环境变量时，联机功能整体关闭，本地玩法不受影响 */
export const cloudConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('云服务未配置：缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  }
  return supabase;
}
