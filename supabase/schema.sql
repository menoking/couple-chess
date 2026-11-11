-- 情侣飞行棋 · 云同步与联机 schema
-- 在 Supabase SQL Editor 里整段执行即可（可重复执行）。

create extension if not exists pgcrypto;

-- ---------- 小屋（一对情侣一个 space） ----------
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default '我们的小屋',
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------- 成员（seat 0 / 1，最多两人） ----------
create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat int not null check (seat in (0, 1)),
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id),
  unique (space_id, seat)
);

-- ---------- 共享数据（题库 / 设置） ----------
create table if not exists public.space_data (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  themes jsonb,
  settings jsonb,
  updated_at timestamptz not null default now()
);

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_data enable row level security;

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

drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces
  for select using (public.is_space_member(id));

drop policy if exists spaces_insert on public.spaces;
create policy spaces_insert on public.spaces
  for insert with check (created_by = auth.uid());

drop policy if exists members_select on public.space_members;
create policy members_select on public.space_members
  for select using (public.is_space_member(space_id));

drop policy if exists members_insert on public.space_members;
create policy members_insert on public.space_members
  for insert with check (user_id = auth.uid());

drop policy if exists data_all on public.space_data;
create policy data_all on public.space_data
  for all using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

-- ---------- 用邀请码加入 ----------
create or replace function public.join_space_by_code(p_code text)
returns table (space_id uuid, seat int, name text, invite_code text)
language plpgsql
security definer
as $$
declare
  v_space public.spaces;
  v_seat int;
  v_existing int;
begin
  select * into v_space from public.spaces s where upper(s.invite_code) = upper(p_code);
  if not found then
    raise exception '邀请码不存在';
  end if;

  select m.seat into v_existing
    from public.space_members m
   where m.space_id = v_space.id and m.user_id = auth.uid();

  if v_existing is not null then
    return query select v_space.id, v_existing, v_space.name, v_space.invite_code;
    return;
  end if;

  select c.candidate into v_seat
    from (select 0 as candidate union select 1) c
   where c.candidate not in (select seat from public.space_members where space_id = v_space.id)
   limit 1;

  if v_seat is null then
    raise exception '小屋已满（只能两个人）';
  end if;

  insert into public.space_members (space_id, user_id, seat)
  values (v_space.id, auth.uid(), v_seat);

  return query select v_space.id, v_seat, v_space.name, v_space.invite_code;
end;
$$;

grant execute on function public.join_space_by_code(text) to authenticated;

-- Realtime 用不到表级订阅（对局状态走 broadcast），如需跨设备推送题库更新，
-- 可在 Database → Replication 里把 space_data 加入 publication。
