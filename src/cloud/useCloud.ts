import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { cloudConfigured, supabase } from './client';
import { MemberInfo, Seat, SpaceInfo } from './types';
import { resetLocalState } from '../utils/localStorage';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const FAKE_MAIL_DOMAIN = 'cfc.local';

export const TEST_ACCOUNT = { username: 'test', password: 'test1234' };

export function toAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${FAKE_MAIL_DOMAIN}`;
}

function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 把底层错误翻译成能直接照做的提示 */
function friendlyAuthError(message: string): string {
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '连不上云服务：请检查 VITE_SUPABASE_URL，或确认 Supabase 项目没有被暂停';
  }
  if (/invalid api key|no api key/i.test(message)) {
    return 'API Key 无效：请确认填的是 Publishable（anon）key';
  }
  if (/email signups are disabled|signups? not allowed/i.test(message)) {
    return '注册被关闭：去 Supabase → Authentication → Sign In / Providers → Email，打开 Enable email provider 和允许注册';
  }
  if (/invalid login credentials/i.test(message)) {
    return '用户名或密码不对';
  }
  if (/user already registered/i.test(message)) {
    return '这个用户名已被占用，换一个或直接登录';
  }
  return message;
}

export function useCloud() {
  const [user, setUser] = useState<User | null>(null);
  const [space, setSpace] = useState<SpaceInfo | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(cloudConfigured);
  const [error, setError] = useState<string | null>(null);

  const username = (user?.user_metadata?.username as string | undefined) ?? user?.email?.split('@')[0] ?? '';

  /** 首次登录自动建屋（一个账号一间，靠唯一索引防重复） */
  const ensureSpace = useCallback(async (authUser: User, name: string) => {
    const client = supabase;
    if (!client) return;

    const findMembership = async () => {
      const { data, error: queryError } = await client
        .from('space_members')
        .select('space_id, seat, display_name, spaces(id, name, invite_code)')
        .eq('user_id', authUser.id)
        .order('joined_at', { ascending: true })
        .limit(1);
      if (queryError) throw queryError;
      return data && data.length > 0 ? data[0] : null;
    };

    let membership = await findMembership();

    if (!membership) {
      const spaceId = newId();
      const { error: insertError } = await client.from('spaces').insert({
        id: spaceId,
        name: `${name || '我们'}的小屋`,
        invite_code: randomCode(),
        created_by: authUser.id
      });
      // 23505 = 另一台设备刚刚建过，直接复用
      if (insertError && insertError.code !== '23505') throw insertError;

      if (!insertError) {
        const { error: memberError } = await client.from('space_members').insert({
          space_id: spaceId,
          user_id: authUser.id,
          seat: 0,
          display_name: name || null
        });
        if (memberError && memberError.code !== '23505') throw memberError;
      }

      membership = await findMembership();
    }

    if (!membership) {
      setSpace(null);
      return;
    }

    const info = membership.spaces as unknown as { id: string; name: string; invite_code: string } | null;
    if (!info) {
      setSpace(null);
      return;
    }

    setSpace({
      id: info.id,
      name: info.name,
      inviteCode: info.invite_code,
      seat: (membership.seat === 1 ? 1 : 0) as Seat
    });

    const { data: roster } = await client
      .from('space_members')
      .select('user_id, seat, display_name')
      .eq('space_id', info.id);

    setMembers(
      (roster ?? []).map(row => ({
        userId: row.user_id as string,
        seat: (row.seat === 1 ? 1 : 0) as Seat,
        displayName: (row.display_name as string | null) ?? null
      }))
    );
  }, []);

  useEffect(() => {
    if (!cloudConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const nextUser = data.session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        try {
          await ensureSpace(nextUser, (nextUser.user_metadata?.username as string) || '');
        } catch (err) {
          setError(friendlyAuthError(err instanceof Error ? err.message : '初始化小屋失败'));
        }
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void ensureSpace(nextUser, (nextUser.user_metadata?.username as string) || '');
      } else {
        setSpace(null);
        setMembers([]);
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
      setError(friendlyAuthError(signUpError.message));
      throw signUpError;
    }
    if (!data.session) {
      setError('注册成功但未自动登录：请去 Supabase 关闭 Confirm email 后再试');
      return;
    }
    setUser(data.session.user);
    await ensureSpace(data.session.user, name.trim());
  }, [ensureSpace]);

  const signIn = useCallback(async (name: string, password: string) => {
    if (!supabase) throw new Error('云服务未配置');
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: toAuthEmail(name),
      password
    });
    if (signInError) {
      setError(friendlyAuthError(signInError.message));
      throw signInError;
    }
    setUser(data.user);
    await ensureSpace(data.user, (data.user.user_metadata?.username as string) || name.trim());
  }, [ensureSpace]);

  /** 一键测试账号：优先登录，没建过就自动注册 */
  const signInTest = useCallback(async () => {
    if (!supabase) throw new Error('云服务未配置');
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: toAuthEmail(TEST_ACCOUNT.username),
      password: TEST_ACCOUNT.password
    });
    if (!signInError && data.user) {
      setUser(data.user);
      await ensureSpace(data.user, TEST_ACCOUNT.username);
      return;
    }
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: toAuthEmail(TEST_ACCOUNT.username),
      password: TEST_ACCOUNT.password,
      options: { data: { username: TEST_ACCOUNT.username } }
    });
    if (signUpError) {
      setError(friendlyAuthError(signUpError.message));
      throw signUpError;
    }
    if (signUpData.session) {
      setUser(signUpData.session.user);
      await ensureSpace(signUpData.session.user, TEST_ACCOUNT.username);
    } else {
      setError('测试账号创建成功，但需要确认邮箱。请关闭 Confirm email 后重试。');
    }
  }, [ensureSpace]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // 退出时清掉本地对局数据，避免下一个账号串数据
    resetLocalState();
    setUser(null);
    setSpace(null);
    setMembers([]);
    window.location.reload();
  }, []);

  return {
    configured: cloudConfigured,
    user,
    username,
    isTestAccount: username === TEST_ACCOUNT.username,
    space,
    members,
    loading,
    error,
    signUp,
    signIn,
    signInTest,
    signOut
  };
}
