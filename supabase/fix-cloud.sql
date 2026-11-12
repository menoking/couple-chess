-- 情侣飞行棋 · 云同步修复脚本（幂等，SQL Editor 里整段执行一次即可）
--
-- 新版「小屋」直接用账号 ID（auth.users.id），不再读写 spaces / space_members / rooms。
-- 题库同步只写 space_data 一行：space_id = auth.uid()。
-- 老项目里常见的报错（PGRST205 表不存在、23503 外键、RLS 拒绝、关系缓存过期）
-- 都由这个脚本一次性补齐。

create extension if not exists pgcrypto;

create table if not exists public.space_data (
  space_id uuid primary key,
  themes jsonb,
  settings jsonb,
  updated_at timestamptz not null default now()
);

-- 旧版 space_data.space_id 外键指向 spaces，写入「账号 ID」时会 23503。
-- 去掉这个依赖后，即使 spaces / rooms 表没建好，题库同步也能正常用。
alter table public.space_data drop constraint if exists space_data_space_id_fkey;

-- 旧成员策略依赖这个函数；先确保它引用的表存在，避免 create or replace 失败。
create table if not exists public.space_members (
  space_id uuid not null,
  user_id uuid not null,
  seat int not null default 0,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create or replace function public.is_space_member(p_space uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space and m.user_id = auth.uid()
  );
$$;

alter table public.space_data enable row level security;

-- 兼容老小屋（随机 uuid 的 space_id）
drop policy if exists data_all on public.space_data;
create policy data_all on public.space_data
  for all using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

-- 新版：本人读写自己那一行，不需要 membership
drop policy if exists data_owner_all on public.space_data;
create policy data_owner_all on public.space_data
  for all using (space_id = auth.uid())
  with check (space_id = auth.uid());

-- 刷新 PostgREST 的表/关系缓存（PGRST200 / PGRST205 多半就是缓存没更新）
notify pgrst, 'reload schema';
