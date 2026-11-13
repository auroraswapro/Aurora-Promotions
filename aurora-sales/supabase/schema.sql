-- ============================================================================
-- Aurora Sales: AI lead follow-up system, powered by Claude.
-- A separate system with its own database, team and sign-in.
-- Use a NEW Supabase project for it (not the Team Tracker's).
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- Safe to run more than once.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- the sales team --------------------------------------------------

create table if not exists public.sales_team (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null default '' check (char_length(display_name) <= 80),
  title        text not null default '' check (char_length(title) <= 80),
  role         text not null default 'rep' check (role in ('manager', 'rep')),
  active       boolean not null default true,
  joined_at    timestamptz not null default now()
);

create table if not exists public.sales_invites (
  email        text primary key check (email = lower(email)),
  display_name text not null default '' check (char_length(display_name) <= 80),
  title        text not null default '' check (char_length(title) <= 80),
  role         text not null default 'rep' check (role in ('manager', 'rep')),
  created_at   timestamptz not null default now()
);

create or replace function public.is_sales_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sales_team where id = auth.uid() and active);
$$;

create or replace function public.is_sales_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sales_team where id = auth.uid() and active and role = 'manager');
$$;

-- Called right after someone signs in with their email code.
-- The very first person to sign in becomes the sales manager.
-- Everyone else must have been added on the Team page first.
create or replace function public.join_sales_team() returns public.sales_team
language plpgsql security definer set search_path = public as $$
declare
  p   public.sales_team;
  inv public.sales_invites;
  em  text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into p from public.sales_team where id = auth.uid();
  if found and p.active then return p; end if;

  select * into inv from public.sales_invites where email = em;
  if found then
    perform set_config('aurora.joining', 'on', true);
    if p.id is not null then
      update public.sales_team set active = true, role = inv.role,
        display_name = coalesce(nullif(inv.display_name, ''), display_name),
        title = coalesce(nullif(inv.title, ''), title)
      where id = auth.uid() returning * into p;
    else
      insert into public.sales_team (id, email, display_name, title, role)
      values (auth.uid(), em, inv.display_name, inv.title, inv.role) returning * into p;
    end if;
    delete from public.sales_invites where email = em;
    return p;
  end if;

  perform pg_advisory_xact_lock(4243);
  if p.id is null and not exists (select 1 from public.sales_team) then
    insert into public.sales_team (id, email, display_name, title, role)
    values (auth.uid(), em, '', 'Sales Manager', 'manager') returning * into p;
    return p;
  end if;

  raise exception 'not_invited';
end;
$$;
revoke all on function public.join_sales_team() from public, anon;
grant execute on function public.join_sales_team() to authenticated;

-- Reps can edit their own name and title, but not their role or access.
-- The team always keeps at least one manager.
create or replace function public.protect_sales_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.email := old.email; new.joined_at := old.joined_at;
  if not public.is_sales_admin() and coalesce(current_setting('aurora.joining', true), '') <> 'on' then
    new.role := old.role; new.active := old.active;
  end if;
  if old.role = 'manager' and old.active and (new.role <> 'manager' or not new.active)
     and not exists (select 1 from public.sales_team where role = 'manager' and active and id <> old.id) then
    raise exception 'There must be at least one manager.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_sales_team on public.sales_team;
create trigger protect_sales_team before update on public.sales_team for each row execute function public.protect_sales_team();

alter table public.sales_team    enable row level security;
alter table public.sales_invites enable row level security;
revoke all on public.sales_team, public.sales_invites from anon;
grant select, update on public.sales_team to authenticated;
grant select, insert, update, delete on public.sales_invites to authenticated;

drop policy if exists "members see the team" on public.sales_team;
create policy "members see the team" on public.sales_team for select to authenticated using (public.is_sales_member());
drop policy if exists "edit self or manager edits" on public.sales_team;
create policy "edit self or manager edits" on public.sales_team for update to authenticated
  using (public.is_sales_member() and (id = auth.uid() or public.is_sales_admin())) with check (public.is_sales_member());
drop policy if exists "managers manage invites" on public.sales_invites;
create policy "managers manage invites" on public.sales_invites for all to authenticated
  using (public.is_sales_admin()) with check (public.is_sales_admin());

-- ---------- leads and emails ------------------------------------------------

-- One row per potential client.
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default '' check (char_length(name) <= 160),
  email           text not null default '' check (char_length(email) <= 254),
  phone           text not null default '' check (char_length(phone) <= 60),
  company         text not null default '' check (char_length(company) <= 160),
  source          text not null default '' check (char_length(source) <= 80),
  -- new: nothing sent yet · following: in the follow-up sequence · replied: the lead answered
  -- meeting / quoted: deal is moving · won / lost: finished · paused: on hold
  -- finished: sequence ended with no reply · unsubscribed: asked us to stop
  status          text not null default 'new' check (status in
                    ('new','following','replied','meeting','quoted','won','lost','paused','finished','unsubscribed')),
  owner_id        uuid references public.sales_team (id) on delete set null,
  score           int  not null default 0 check (score between 0 and 100),
  temperature     text not null default 'warm' check (temperature in ('hot','warm','cold')),
  summary         text not null default '' check (char_length(summary) <= 4000),
  next_action     text not null default '' check (char_length(next_action) <= 1000),
  -- products, quantity, deadline, budget, location, notes, original enquiry …
  details         jsonb not null default '{}'::jsonb,
  -- how many of our emails in a row have had no reply (resets when they reply)
  next_step       int  not null default 0 check (next_step between 0 and 50),
  -- when Claude should write again if there's still no reply (Claude picks this for each email)
  next_due_at     timestamptz,
  last_contact_at timestamptz,
  last_reply_at   timestamptz,
  thread_id       text not null default '',
  value           numeric check (value is null or value >= 0),
  created_by      uuid references public.sales_team (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_due_idx on public.leads (next_due_at);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_owner_idx on public.leads (owner_id);

-- Every email drafted, sent or received, plus team notes.
create table if not exists public.lead_messages (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,
  direction    text not null check (direction in ('out','in','note')),
  -- draft: waiting for approval · sent · failed · skipped · received (a reply) · note
  status       text not null check (status in ('draft','sent','failed','skipped','received','note')),
  kind         text not null default 'followup' check (kind in ('first','followup','reply','manual','inbound','note')),
  step         int,
  -- Claude's suggestion: if no reply, write again after this many days (0 = don't follow up)
  follow_up_days int check (follow_up_days is null or follow_up_days between 0 and 60),
  subject      text not null default '' check (char_length(subject) <= 400),
  body         text not null default '' check (char_length(body) <= 20000),
  ai_subject   text not null default '',
  ai_body      text not null default '',
  ai_reason    text not null default '' check (char_length(ai_reason) <= 2000),
  ai           jsonb not null default '{}'::jsonb,
  provider_id  text not null default '',
  message_id   text not null default '',
  error        text not null default '',
  created_by   uuid references public.sales_team (id) on delete set null,
  approved_by  uuid references public.sales_team (id) on delete set null,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists lead_messages_lead_idx on public.lead_messages (lead_id, created_at);
create index if not exists lead_messages_status_idx on public.lead_messages (status);
create unique index if not exists lead_messages_provider_idx on public.lead_messages (provider_id) where provider_id <> '' and direction = 'in';

-- A simple history of what happened to each lead.
create table if not exists public.lead_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  type       text not null check (char_length(type) <= 40),
  text       text not null default '' check (char_length(text) <= 2000),
  user_id    uuid references public.sales_team (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

-- The playbook Claude follows (company info, tone, rules) and the follow-up schedule.
create table if not exists public.sales_settings (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);

-- ---------- automatic stamps ------------------------------------------------

create or replace function public.stamp_lead() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists stamp_lead on public.leads;
create trigger stamp_lead before insert or update on public.leads for each row execute function public.stamp_lead();

create or replace function public.stamp_lead_child() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_table_name = 'lead_events' then new.user_id := auth.uid(); else new.created_by := auth.uid(); end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists stamp_lead_child on public.lead_messages;
create trigger stamp_lead_child before insert on public.lead_messages for each row execute function public.stamp_lead_child();
drop trigger if exists stamp_lead_child on public.lead_events;
create trigger stamp_lead_child before insert on public.lead_events for each row execute function public.stamp_lead_child();

-- Team members may edit a waiting draft (or skip it), but only the server can mark
-- an email as sent. That way nothing reaches a client without going through approval.
create or replace function public.guard_lead_message() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;  -- server (service role)
  if old.status <> 'draft' or new.status not in ('draft','skipped') then
    raise exception 'Only waiting drafts can be edited.';
  end if;
  new.lead_id := old.lead_id; new.direction := old.direction; new.kind := old.kind;
  new.ai_subject := old.ai_subject; new.ai_body := old.ai_body; new.provider_id := old.provider_id;
  new.sent_at := old.sent_at; new.approved_by := old.approved_by; new.created_by := old.created_by;
  return new;
end;
$$;
drop trigger if exists guard_lead_message on public.lead_messages;
create trigger guard_lead_message before update on public.lead_messages for each row execute function public.guard_lead_message();

-- ---------- who can do what -------------------------------------------------
-- Everyone on the team can see and work leads.
-- Sending an email always goes through the server, after a person approves it.
-- Only managers can delete leads or change the playbook.

alter table public.leads          enable row level security;
alter table public.lead_messages  enable row level security;
alter table public.lead_events    enable row level security;
alter table public.sales_settings enable row level security;
revoke all on public.leads, public.lead_messages, public.lead_events, public.sales_settings from anon;
grant select, insert, update, delete on public.leads, public.lead_messages, public.lead_events, public.sales_settings to authenticated;

drop policy if exists "members read leads" on public.leads;
create policy "members read leads" on public.leads for select to authenticated using (public.is_sales_member());
drop policy if exists "members add leads" on public.leads;
create policy "members add leads" on public.leads for insert to authenticated with check (public.is_sales_member());
drop policy if exists "members edit leads" on public.leads;
create policy "members edit leads" on public.leads for update to authenticated using (public.is_sales_member()) with check (public.is_sales_member());
drop policy if exists "admins delete leads" on public.leads;
create policy "admins delete leads" on public.leads for delete to authenticated using (public.is_sales_admin());

drop policy if exists "members read lead messages" on public.lead_messages;
create policy "members read lead messages" on public.lead_messages for select to authenticated using (public.is_sales_member());
drop policy if exists "members add notes" on public.lead_messages;
create policy "members add notes" on public.lead_messages for insert to authenticated
  with check (public.is_sales_member() and status in ('note','received') and direction in ('note','in'));
drop policy if exists "members edit drafts" on public.lead_messages;
create policy "members edit drafts" on public.lead_messages for update to authenticated
  using (public.is_sales_member() and status = 'draft') with check (public.is_sales_member());
drop policy if exists "admins delete lead messages" on public.lead_messages;
create policy "admins delete lead messages" on public.lead_messages for delete to authenticated using (public.is_sales_admin());

drop policy if exists "members read lead events" on public.lead_events;
create policy "members read lead events" on public.lead_events for select to authenticated using (public.is_sales_member());
drop policy if exists "members add lead events" on public.lead_events;
create policy "members add lead events" on public.lead_events for insert to authenticated with check (public.is_sales_member());

drop policy if exists "members read sales settings" on public.sales_settings;
create policy "members read sales settings" on public.sales_settings for select to authenticated using (public.is_sales_member());
drop policy if exists "admins manage sales settings" on public.sales_settings;
create policy "admins manage sales settings" on public.sales_settings for all to authenticated
  using (public.is_sales_admin()) with check (public.is_sales_admin());

-- ---------- integrations (GoHighLevel, website forms) -----------------------
-- Private settings: the GHL key and the lead-intake link key. No one can read this
-- table from the app; only the server can. Managers change it through the functions below.
create table if not exists public.sales_private (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);
alter table public.sales_private enable row level security;
revoke all on public.sales_private from anon, authenticated;

create or replace function public.get_integrations() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d jsonb;
begin
  if not public.is_sales_admin() then raise exception 'managers_only'; end if;
  select data into d from public.sales_private where id = 'integrations';
  d := coalesce(d, '{}'::jsonb);
  return jsonb_build_object(
    'intakeKey', coalesce(d->>'intakeKey', ''),
    'ghlConnected', coalesce(d->>'ghlToken', '') <> '',
    'ghlLocationId', coalesce(d->>'ghlLocationId', ''),
    'ghlSync', coalesce((d->>'ghlSync')::boolean, true));
end;
$$;

create or replace function public.new_intake_key() returns text
language plpgsql security definer set search_path = public as $$
declare k text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_sales_admin() then raise exception 'managers_only'; end if;
  insert into public.sales_private (id, data) values ('integrations', jsonb_build_object('intakeKey', k))
  on conflict (id) do update set data = public.sales_private.data || jsonb_build_object('intakeKey', k);
  return k;
end;
$$;

-- Saves the GHL connection. An empty token keeps the one already saved.
create or replace function public.save_ghl(p_token text, p_location text, p_sync boolean) returns void
language plpgsql security definer set search_path = public as $$
declare patch jsonb := jsonb_build_object('ghlLocationId', trim(coalesce(p_location, '')), 'ghlSync', coalesce(p_sync, true));
begin
  if not public.is_sales_admin() then raise exception 'managers_only'; end if;
  if coalesce(trim(p_token), '') <> '' then patch := patch || jsonb_build_object('ghlToken', trim(p_token)); end if;
  insert into public.sales_private (id, data) values ('integrations', patch)
  on conflict (id) do update set data = public.sales_private.data || patch;
end;
$$;

create or replace function public.disconnect_ghl() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_sales_admin() then raise exception 'managers_only'; end if;
  update public.sales_private set data = data - 'ghlToken' - 'ghlLocationId' where id = 'integrations';
end;
$$;

revoke all on function public.get_integrations(), public.new_intake_key(), public.save_ghl(text, text, boolean), public.disconnect_ghl() from public, anon;
grant execute on function public.get_integrations(), public.new_intake_key(), public.save_ghl(text, text, boolean), public.disconnect_ghl() to authenticated;

-- ---------- live updates ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sales_team', 'sales_invites', 'leads', 'lead_messages', 'lead_events', 'sales_settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- starting playbook and follow-up limits --------------------------
-- Managers can change all of this later on the Playbook page.
insert into public.sales_settings (id, data) values ('playbook', jsonb_build_object(
  'company', 'Aurora Promotions',
  'about', 'Aurora Promotions makes custom printed apparel and promotional products for businesses, schools, events, teams and non-profits: t-shirts, hoodies, sweatshirts, hats, staff uniforms and branded merchandise.',
  'offer', E'Screen printing, embroidery and DTF printing\nFree design help and a digital proof before anything is printed\nBulk pricing that gets better with quantity\nFast turnaround for event deadlines',
  'tone', 'Friendly, warm and professional. Short, clear sentences. Sound like a helpful person, not a marketing email.',
  'rules', E'Never promise a price, discount or delivery date that is not written in this playbook. Offer to send a quote instead.\nKeep emails under 120 words.\nAsk one simple question at the end so it is easy to reply.\nNo pushy language and no fake urgency.',
  'cta', 'Reply with your quantity, colours and deadline and we will send a free quote the same day.',
  'quoteLink', '',
  'signature', E'{rep_name}\nAurora Promotions',
  'optOut', 'If you would rather not hear from us, just reply "stop".',
  'assign', 'round_robin'
)) on conflict (id) do nothing;

-- There is no fixed follow-up schedule: Claude decides what to say and when to check in,
-- one email at a time. These are only the limits.
insert into public.sales_settings (id, data) values ('followup', jsonb_build_object(
  'maxFollowups', 5,   -- stop after this many emails in a row with no reply
  'defaultDays', 3,    -- used only if Claude gives no suggestion
  'leadHours', 12      -- write each follow-up this many hours early, so there's time to approve it
)) on conflict (id) do nothing;

-- Done! You should see "Success. No rows returned".
