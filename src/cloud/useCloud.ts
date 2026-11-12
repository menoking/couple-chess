import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { cloudConfigured, supabase } from './client';
import { MemberInfo, Seat, SpaceInfo } from './types';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export interface CloudState {
  configured: boolean;
  user: User | null;
  space: SpaceInfo | null;
  members: MemberInfo[];
  loading: boolean;
  error: string | null;
}

export function useCloud() {
  const [user, setUser] = useState<User | null>(null);
  const [space, setSpace] = useState<SpaceInfo | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [loading, setLoading] = useState(cloudConfigured);
  const [error, setError] = useState<string | null>(null);

  const loadSpace = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data: membership, error: memberError } = await supabase
      .from('space_members')
      .select('space_id, seat, display_name, spaces(id, name, invite_code)')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1);

    if (memberError) {
      setError(memberError.message);
      return;
    }
    if (!membership || membership.length === 0) {
      setSpace(null);
      setMembers([]);
      return;
    }

    const row = membership[0];
    const info = row.spaces as unknown as { id: string; name: string; invite_code: string } | null;
    if (!info) {
      setSpace(null);
      return;
    }

    setSpace({
      id: info.id,
      name: info.name,
      inviteCode: info.invite_code,
      seat: (row.seat === 1 ? 1 : 0) as Seat
    });

    const { data: roster } = await supabase
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
      if (nextUser) await loadSpace(nextUser.id);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadSpace(nextUser.id);
      } else {
        setSpace(null);
        setMembers([]);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadSpace]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('云服务未配置');
    setError(null);
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setError(signUpError.message);
      throw signUpError;
    }
    if (!data.session) {
      setError('注册成功，但需要邮箱验证。请在 Supabase 后台关闭 Confirm email 后再试。');
      return;
    }
    setUser(data.session.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('云服务未配置');
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }
    setUser(data.user);
    await loadSpace(data.user.id);
  }, [loadSpace]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSpace(null);
    setMembers([]);
  }, []);

  const createSpace = useCallback(
    async (name: string) => {
      if (!supabase) throw new Error('云服务未配置');
      if (!user) throw new Error('请先登录');
      setError(null);

      for (let attempt = 0; attempt < 5; attempt++) {
        const inviteCode = randomCode();
        const { data, error: insertError } = await supabase
          .from('spaces')
          .insert({ name: name || '我们的小屋', invite_code: inviteCode, created_by: user.id })
          .select('id, name, invite_code')
          .single();

        if (insertError) {
          if (insertError.code === '23505') continue;
          setError(insertError.message);
          throw insertError;
        }

        const { error: memberError } = await supabase.from('space_members').insert({
          space_id: data.id,
          user_id: user.id,
          seat: 0,
          display_name: null
        });
        if (memberError) {
          setError(memberError.message);
          throw memberError;
        }

        await loadSpace(user.id);
        return inviteCode;
      }
      throw new Error('邀请码生成失败，请重试');
    },
    [loadSpace, user]
  );

  const joinSpace = useCallback(
    async (code: string) => {
      if (!supabase) throw new Error('云服务未配置');
      if (!user) throw new Error('请先登录');
      setError(null);
      const { error: rpcError } = await supabase.rpc('join_space_by_code', {
        p_code: code.trim().toUpperCase()
      });
      if (rpcError) {
        setError(rpcError.message);
        throw rpcError;
      }
      await loadSpace(user.id);
    },
    [loadSpace, user]
  );

  return {
    configured: cloudConfigured,
    user,
    space,
    members,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    createSpace,
    joinSpace,
    refresh: () => (user ? loadSpace(user.id) : Promise.resolve())
  };
}
