import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 容错处理：常见的粘贴错误是带上 /rest/v1/ 后缀、末尾斜杠或换行。
 * 这里统一清洗，避免 createClient 拿到错误 base url。
 */
function normalizeUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;
  let value = input.trim().replace(/\s+/g, '');
  value = value.replace(/\/+$/, '');
  value = value.replace(/\/rest\/v1.*$/i, '');
  return value || undefined;
}

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

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
