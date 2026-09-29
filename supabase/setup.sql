-- ============================================================================
-- Aurora Promotions Team Tracker: database setup
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- Safe to run more than once.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- tables ----------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '' check (char_length(display_name) <= 80),
  title        text not null default '' check (char_length(title) <= 80),
  color        text not null default '#6d4aff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  role         text not null default 'member' check (role in ('admin', 'member')),
  active       boolean not null default true,
  joined_at    timestamptz not null default now()
);

create table if not exists public.invites (
  email        text primary key check (email = lower(email)),
  display_name text not null default '' check (char_length(display_name) <= 80),
  title        text not null default '' check (char_length(title) <= 80),
  role         text not null default 'member' check (role in ('admin', 'member')),
  invited_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  client      text not null default '' check (char_length(client) <= 120),
  description text not null default '' check (char_length(description) <= 4000),
  color       text not null default '#6d4aff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  status      text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'completed')),
  start_date  date,
  due_date    date,
  lead_id     uuid references public.profiles (id) on delete set null,
  example     boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 200),
  description    text not null default '' check (char_length(description) <= 8000),
  assignee_id    uuid references public.profiles (id) on delete set null,
  status         text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'blocked', 'done')),
  priority       text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  progress       int  not null default 0 check (progress between 0 and 100),
  start_date     date,
  due_date       date,
  estimate_hours numeric check (estimate_hours is null or estimate_hours between 0 and 1000),
  example        boolean not null default false,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table if not exists public.activity (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (char_length(type) <= 40),
  user_id    uuid references public.profiles (id) on delete cascade default auth.uid(),
  task_id    uuid references public.tasks (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  text       text not null default '' check (char_length(text) <= 4000),
  to_status  text,
  created_at timestamptz not null default now()
);

create index if not exists activity_created_at_idx on public.activity (created_at desc);
create index if not exists activity_task_idx on public.activity (task_id);
create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id);

-- ---------- helper checks ---------------------------------------------------

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

-- ---------- joining the team ------------------------------------------------
-- Called right after someone signs in with their email code.
-- The very first person to sign in becomes the manager (admin).
-- Everyone else must have been added on the Team page first.

create or replace function public.join_team() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  p   public.profiles;
  inv public.invites;
  em  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  palette text[] := array['#6d4aff','#0ea5a4','#e0569b','#f08c2e','#2f7de1','#16a34a','#9b5de5','#d9480f'];
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select * into p from public.profiles where id = auth.uid();
  if found and p.active then
    return p;
  end if;

  select * into inv from public.invites where email = em;

  if found then
    -- lets protect_profile() accept the role/active change made here
    perform set_config('aurora.joining', 'on', true);
    if p.id is not null then
      update public.profiles set active = true, role = inv.role,
        display_name = coalesce(nullif(inv.display_name, ''), display_name),
        title = coalesce(nullif(inv.title, ''), title)
      where id = auth.uid() returning * into p;
    else
      insert into public.profiles (id, email, display_name, title, role, color)
      values (auth.uid(), em, inv.display_name, inv.title, inv.role,
              palette[1 + ((select count(*) from public.profiles)::int % 8)])
      returning * into p;
    end if;
    delete from public.invites where email = em;
    return p;
  end if;

  -- Bootstrap: nobody on the team yet, so the first person in becomes the manager.
  perform pg_advisory_xact_lock(4242);
  if p.id is null and not exists (select 1 from public.profiles) then
    insert into public.profiles (id, email, display_name, title, role, color)
    values (auth.uid(), em, '', 'Project Manager', 'admin', '#6d4aff')
    returning * into p;
    return p;
  end if;

  raise exception 'not_invited';
end;
$$;

revoke all on function public.join_team() from public, anon;
grant execute on function public.join_team() to authenticated;

-- ---------- guard rails -----------------------------------------------------

-- Team members can edit their own name/title/colour but not their role or status,
-- and the team must always keep at least one manager.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.email := old.email;
  new.joined_at := old.joined_at;
  if not public.is_admin() and coalesce(current_setting('aurora.joining', true), '') <> 'on' then
    new.role := old.role;
    new.active := old.active;
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles where role = 'admin' and active and id <> old.id) then
    raise exception 'There must be at least one admin.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- Record who created a row; never trust the browser for this.
create or replace function public.stamp_creator() returns trigger
language plpgsql as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists stamp_creator on public.projects;
create trigger stamp_creator before insert on public.projects for each row execute function public.stamp_creator();
drop trigger if exists stamp_creator on public.tasks;
create trigger stamp_creator before insert on public.tasks for each row execute function public.stamp_creator();

create or replace function public.stamp_activity() returns trigger
language plpgsql as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists stamp_activity on public.activity;
create trigger stamp_activity before insert on public.activity for each row execute function public.stamp_activity();

-- ---------- row level security ----------------------------------------------

alter table public.profiles enable row level security;
alter table public.invites  enable row level security;
alter table public.projects enable row level security;
alter table public.tasks    enable row level security;
alter table public.activity enable row level security;

revoke all on public.profiles, public.invites, public.projects, public.tasks, public.activity from anon;
grant select, insert, update, delete on public.profiles, public.invites, public.projects, public.tasks, public.activity to authenticated;

drop policy if exists "members read profiles" on public.profiles;
create policy "members read profiles" on public.profiles for select to authenticated
  using (public.is_member() or id = auth.uid());
drop policy if exists "edit own profile or admin" on public.profiles;
create policy "edit own profile or admin" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "admins manage invites" on public.invites;
create policy "admins manage invites" on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members read projects" on public.projects;
create policy "members read projects" on public.projects for select to authenticated using (public.is_member());
drop policy if exists "admins add projects" on public.projects;
create policy "admins add projects" on public.projects for insert to authenticated with check (public.is_admin());
drop policy if exists "admins edit projects" on public.projects;
create policy "admins edit projects" on public.projects for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete projects" on public.projects;
create policy "admins delete projects" on public.projects for delete to authenticated using (public.is_admin());

drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks" on public.tasks for select to authenticated using (public.is_member());
drop policy if exists "members add tasks" on public.tasks;
create policy "members add tasks" on public.tasks for insert to authenticated
  with check (public.is_member() and (public.is_admin() or assignee_id = auth.uid()));
drop policy if exists "assignee creator or admin edit tasks" on public.tasks;
create policy "assignee creator or admin edit tasks" on public.tasks for update to authenticated
  using (public.is_member() and (public.is_admin() or assignee_id = auth.uid() or created_by = auth.uid()))
  with check (public.is_admin() or assignee_id = auth.uid() or created_by = auth.uid());
drop policy if exists "creator or admin delete tasks" on public.tasks;
create policy "creator or admin delete tasks" on public.tasks for delete to authenticated
  using (public.is_member() and (public.is_admin() or created_by = auth.uid()));

drop policy if exists "members read activity" on public.activity;
create policy "members read activity" on public.activity for select to authenticated using (public.is_member());
drop policy if exists "members add activity" on public.activity;
create policy "members add activity" on public.activity for insert to authenticated with check (public.is_member());
drop policy if exists "admins delete activity" on public.activity;
create policy "admins delete activity" on public.activity for delete to authenticated using (public.is_admin());

-- ---------- live updates ----------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['profiles', 'invites', 'projects', 'tasks', 'activity'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Done! You should see "Success. No rows returned".
