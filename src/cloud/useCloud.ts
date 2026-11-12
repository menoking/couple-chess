import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { cloudConfigured, supabase } from './client';
import { SpaceInfo } from './types';
import { resetLocalState } from '../utils/localStorage';

const FAKE_MAIL_DOMAIN = 'cfc.local';

export const TEST_ACCOUNT = { username: 'test', password: 'test1234' };

export function toAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${FAKE_MAIL_DOMAIN}`;
}

/**
 * 小屋 ID 直接取账号 ID（Supabase 的 user.id 本身就是合法 uuid）。
 *
 * 旧版要「查 membership → 建 spaces → 插 member → 嵌套 join 回查 spaces」才算初始化成功，
 * 任何一步出问题（RLS 策略没跑全、PostgREST 外键关系缓存没刷新、两台设备同时建屋撞
 * 唯一索引、http 页面里 crypto.randomUUID 不可用导致非法 uuid）都会让手机端永远卡在
 * 「正在初始化小屋…」。而且 onAuthStateChange 分支里的 ensureSpace 没有 catch，错误被吞掉。
 *
 * 现在这一步纯本地、零网络：登录成功即刻可用，两台设备登同一账号必然是同一间屋。
 * 数据库只负责题库同步，出问题不影响联机。
 */
export function spaceIdOf(user: User): string {
  return user.id;
}

/** 把底层错误翻译成能直接照做的提示 */
export function friendlyAuthError(message: string): string {
  if (/pgrst205|could not find the table|relation .* does not exist/i.test(message)) {
    return '数据库表还没建好：在 Supabase SQL Editor 执行 supabase/fix-cloud.sql（不影响联机，只影响题库同步）';
  }
  if (/pgrst200|could not find a relationship|schema cache/i.test(message)) {
    return '数据库关系缓存过期：在 SQL Editor 执行 supabase/fix-cloud.sql 刷新（不影响联机）';
  }
  if (/23503|foreign key constraint|violates foreign key/i.test(message)) {
    return 'space_data 还绑着旧的外键：在 SQL Editor 执行 supabase/fix-cloud.sql 解除（不影响联机）';
  }
  if (/row-level security|new row violates|permission denied|42501/i.test(message)) {
    return '数据库权限策略不完整：在 SQL Editor 执行 supabase/fix-cloud.sql 补齐（不影响联机）';
  }
  if (/invalid input syntax for type uuid|22P02/i.test(message)) {
    return '数据库字段类型不匹配：在 SQL Editor 执行 supabase/fix-cloud.sql（不影响联机）';
  }
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return '连不上云服务：检查手机网络、VITE_SUPABASE_URL 是否填对，或确认 Supabase 项目没有被暂停';
  }
  if (/invalid api key|no api key/i.test(message)) {
    return 'API Key 无效：请确认填的是 Publishable（anon）key，且 Vercel 加完后已重新部署';
  }
  if (/email signups are disabled|signups? not allowed/i.test(message)) {
    return '注册被关闭：Supabase → Authentication → Sign In / Providers → Email，打开 Enable email provider';
  }
  if (/invalid login credentials/i.test(message)) {
    return '用户名或密码不对';
  }
  if (/user already registered/i.test(message)) {
    return '这个用户名已被占用，换一个或直接登录';
  }
  if (/confirm your email|email not confirmed/i.test(message)) {
    return '邮箱验证没关：Supabase → Authentication → Sign In / Providers → Email，关掉 Confirm email';
  }
  return message;
}

/**
 * 旧版小屋是随机 uuid，题库存在那一行。升级后把它搬到「账号 ID」这一行，避免丢数据。
 * 全程 best effort：旧表结构坏了、权限不足都直接跳过，绝不阻塞联机。
 */
async function migrateLegacyThemes(client: SupabaseClient, user: User): Promise<void> {
  try {
    const { data: oldSpaces } = await client.from('spaces').select('id').eq('created_by', user.id);
    const legacy = (oldSpaces ?? []).find(row => row.id !== user.id);
    if (!legacy) return;

    const { data: target } = await client
      .from('space_data')
      .select('themes')
      .eq('space_id', user.id)
      .maybeSingle();
    if (target?.themes) return;

    const { data: source } = await client
      .from('space_data')
      .select('themes, updated_at')
      .eq('space_id', legacy.id)
      .maybeSingle();
    if (!source?.themes) return;

    await client.from('space_data').upsert({
      space_id: user.id,
      themes: source.themes,
      updated_at: source.updated_at
    });
  } catch {
    // 旧数据结构不可用时，本地题库会由 useCloudSync 自动推成基线
  }
}

export function useCloud() {
  const [user, setUser] = useState<User | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [spaceName, setSpaceName] = useState('我们');
  const [loading, setLoading] = useState(cloudConfigured);
  const [error, setError] = useState<string | null>(null);
  const [syncNonce, setSyncNonce] = useState(0);
  const preparedRef = useRef<string | null>(null);

  const space = useMemo<SpaceInfo | null>(
    () => (spaceId ? { id: spaceId, name: `${spaceName}的小屋`, inviteCode: '', seat: 0 } : null),
    [spaceId, spaceName]
  );

  const username = (user?.user_metadata?.username as string | undefined) ?? user?.email?.split('@')[0] ?? '';

  /** 登录成功即完成「初始化小屋」：不再有任何网络请求，也就不可能失败 */
  const ensureSpace = useCallback((authUser: User, name: string) => {
    if (preparedRef.current === authUser.id) return;
    preparedRef.current = authUser.id;
    setSpaceId(spaceIdOf(authUser));
    setSpaceName(name.trim() || usernameOf(authUser));
    setError(null);
    if (supabase) void migrateLegacyThemes(supabase, authUser);
  }, []);

  useEffect(() => {
    if (!cloudConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const client = supabase;

    void (async () => {
      try {
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (cancelled) return;
        const nextUser = data.session?.user ?? null;
        setUser(nextUser);
        if (nextUser) ensureSpace(nextUser, (nextUser.user_metadata?.username as string) || '');
      } catch (err) {
        if (!cancelled) setError(friendlyAuthError(err instanceof Error ? err.message : '读取登录状态失败'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        // 这里以前是 void ensureSpace(...) 且没有 catch，数据库报错会被静默吞掉，
        // 手机上就表现为「正在初始化小屋…」永远不结束。
        try {
          ensureSpace(nextUser, (nextUser.user_metadata?.username as string) || '');
        } catch (err) {
          setError(friendlyAuthError(err instanceof Error ? err.message : '初始化小屋失败'));
        }
      } else {
        preparedRef.current = null;
        setSpaceId(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [ensureSpace]);

  const signUp = useCallback(async (name: string, password: string) => {
    if (!supabase) throw new Error('云服务未配置');
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: toAuthEmail(name),
      password,
      options: { data: { username: name.trim() } }
    });
    if (signUpError) {
      const friendly = friendlyAuthError(signUpError.message);
      setError(friendly);
      throw new Error(friendly);
    }
    if (!data.session) {
      setError('注册成功但未自动登录：请去 Supabase 关闭 Confirm email 后再试');
      return;
    }
    setUser(data.session.user);
    ensureSpace(data.session.user, name.trim());
  }, [ensureSpace]);

  const signIn = useCallback(async (name: string, password: string) => {
    if (!supabase) throw new Error('云服务未配置');
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: toAuthEmail(name),
      password
    });
    if (signInError) {
      const friendly = friendlyAuthError(signInError.message);
      setError(friendly);
      throw new Error(friendly);
    }
    setUser(data.user);
    ensureSpace(data.user, (data.user.user_metadata?.username as string) || name.trim());
  }, [ensureSpace]);

  /** 一键测试账号：优先登录，只有「账号不存在」时才自动注册 */
  const signInTest = useCallback(async () => {
    if (!supabase) throw new Error('云服务未配置');
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: toAuthEmail(TEST_ACCOUNT.username),
      password: TEST_ACCOUNT.password
    });
    if (!signInError && data.user) {
      setUser(data.user);
      ensureSpace(data.user, TEST_ACCOUNT.username);
      return;
    }
    // 网络/配置问题不能靠「再注册一次」解决，否则会误导成「用户已注册」
    if (signInError && !/invalid login credentials|user not found|email not confirmed/i.test(signInError.message)) {
      throw new Error(friendlyAuthError(signInError.message));
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: toAuthEmail(TEST_ACCOUNT.username),
      password: TEST_ACCOUNT.password,
      options: { data: { username: TEST_ACCOUNT.username } }
    });
    if (signUpError) {
      const friendly = friendlyAuthError(signUpError.message);
      setError(friendly);
      throw new Error(friendly);
    }
    if (signUpData.session) {
      setUser(signUpData.session.user);
      ensureSpace(signUpData.session.user, TEST_ACCOUNT.username);
    } else {
      setError('测试账号创建成功，但需要确认邮箱。请关闭 Confirm email 后重试。');
    }
  }, [ensureSpace]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // 退出时清掉本地对局数据，避免下一个账号串数据
    resetLocalState();
    preparedRef.current = null;
    setUser(null);
    setSpaceId(null);
    window.location.reload();
  }, []);

  /** 面板「重试同步」用：让 useCloudSync 重新拉一次题库 */
  const retrySync = useCallback(() => setSyncNonce(value => value + 1), []);

  return {
    configured: cloudConfigured,
    user,
    username,
    isTestAccount: username === TEST_ACCOUNT.username,
    space,
    loading,
    error,
    syncNonce,
    retrySync,
    signUp,
    signIn,
    signInTest,
    signOut
  };
}

function usernameOf(user: User): string {
  return (user.user_metadata?.username as string) || user.email?.split('@')[0] || '我们';
}
