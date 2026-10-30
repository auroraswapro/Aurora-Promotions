-- ============================================================================
-- Aurora Quotes: adds apparel quotes to the existing team tracker database.
-- Run AFTER supabase/setup.sql (it uses its is_member() / is_admin() checks).
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- Safe to run more than once. It does not change any tracker tables.
-- ============================================================================

create table if not exists public.quotes (
  id          text primary key check (char_length(id) <= 64),
  data        jsonb  not null,
  updated_at  bigint not null default 0,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists quotes_updated_at_idx on public.quotes (updated_at desc);

create table if not exists public.quote_settings (
  id    text primary key,
  data  jsonb not null default '{}'::jsonb
);

-- Record who created a quote; never trust the browser for this.
drop trigger if exists stamp_creator on public.quotes;
create trigger stamp_creator before insert on public.quotes for each row execute function public.stamp_creator();

-- Hands out the next quote number, so two reps never get the same one.
create or replace function public.next_quote_number() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_member() then raise exception 'not_member'; end if;
  insert into public.quote_settings (id, data) values ('company', '{}'::jsonb) on conflict (id) do nothing;
  update public.quote_settings
     set data = jsonb_set(data, '{nextNumber}', to_jsonb(coalesce(nullif(data->>'nextNumber', '')::int, 1001) + 1))
   where id = 'company'
  returning (data->>'nextNumber')::int - 1 into n;
  return n;
end;
$$;
revoke all on function public.next_quote_number() from public, anon;
grant execute on function public.next_quote_number() to authenticated;

-- ---------- who can do what ----------
-- Everyone on the team can see, add and edit quotes.
-- Only the person who made a quote, or a manager, can delete it.
-- Only managers can change company settings (name, logo, default notes).
alter table public.quotes         enable row level security;
alter table public.quote_settings enable row level security;
revoke all on public.quotes, public.quote_settings from anon;
grant select, insert, update, delete on public.quotes, public.quote_settings to authenticated;

drop policy if exists "members read quotes" on public.quotes;
create policy "members read quotes" on public.quotes for select to authenticated using (public.is_member());
drop policy if exists "members add quotes" on public.quotes;
create policy "members add quotes" on public.quotes for insert to authenticated with check (public.is_member());
drop policy if exists "members edit quotes" on public.quotes;
create policy "members edit quotes" on public.quotes for update to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists "creator or admin delete quotes" on public.quotes;
create policy "creator or admin delete quotes" on public.quotes for delete to authenticated
  using (public.is_member() and (public.is_admin() or created_by = auth.uid()));

drop policy if exists "members read quote settings" on public.quote_settings;
create policy "members read quote settings" on public.quote_settings for select to authenticated using (public.is_member());
drop policy if exists "admins manage quote settings" on public.quote_settings;
create policy "admins manage quote settings" on public.quote_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- live updates ----------
alter table public.quotes replica identity full;
do $$
declare t text;
begin
  foreach t in array array['quotes', 'quote_settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- starting data: company settings and the Tina example quote ----------
insert into public.quote_settings (id, data) values ('company', '{"companyName": "Aurora Promotions", "logo": "../logo.png", "validDays": 30, "taxRate": 0, "nextNumber": 1002, "notes": "The price includes the clothing and all the printing listed for each item.\nSmall to XL are one price. XXL is a larger size, so it costs a little more.\nShipping is not included in this total. We will send you the shipping cost separately.\nBefore we print, we will send you a picture of the design to approve.", "closing": "Happy with this quote? Just reply to the email and say “Approved.”"}'::jsonb) on conflict (id) do nothing;
insert into public.quotes (id, data, updated_at) values ('qtina', '{"id": "qtina", "number": "1001", "customer": "Tina", "date": "2026-10-30", "validDays": 30, "status": "draft", "items": [{"id": "i1", "name": "Hoodie", "blank": "ATC™ Everyday Fleece Hoodie", "printing": "Small logo on left chest (3.5\" x 2.5\")\nDesign on sleeve (3\" x 13\")", "base": 28, "prices": {"XXL": 32}, "colors": [{"id": "c10", "name": "Caramel", "unavailable": false, "suggest": "", "q": {"S": 2, "M": 3, "L": 3, "XL": 4, "XXL": 3}}, {"id": "c11", "name": "Heather Gray", "unavailable": true, "suggest": "Dark Heather Gray, Ash Gray", "q": {"S": 2, "M": 3, "L": 3, "XL": 3, "XXL": 2}}, {"id": "c12", "name": "Dark Green", "unavailable": false, "suggest": "", "q": {"S": 1, "M": 2, "L": 2, "XL": 2, "XXL": 2}}, {"id": "c13", "name": "Camel", "unavailable": true, "suggest": "", "q": {"L": 1}}]}, {"id": "i2", "name": "Sweatpants", "blank": "ATC™ Everyday Fleece Sweatpants", "printing": "Design on leg (3\" x 14\")", "base": 28, "prices": {"XXL": 31}, "colors": [{"id": "c20", "name": "Black", "unavailable": false, "suggest": "", "q": {"S": 2, "M": 3, "L": 4, "XL": 3, "XXL": 2}}]}, {"id": "i3", "name": "Staff Hoodie", "blank": "ATC™ Everyday Fleece Hoodie", "printing": "Logo on front center (10\" x 5.5\")\n\"STAFF\" on back (11\" x 5.5\")", "base": 28, "prices": {"XXL": 32}, "colors": [{"id": "c30", "name": "Black", "unavailable": false, "suggest": "", "q": {"M": 5, "L": 2}}, {"id": "c31", "name": "Light Blue", "unavailable": false, "suggest": "", "q": {"L": 1}}]}, {"id": "i4", "name": "Staff T-Shirt", "blank": "ATC™ Everyday Cotton Tee", "printing": "Logo on front center (10\" x 5.5\")\n\"STAFF\" on back (11\" x 5.5\")", "base": 12, "prices": {}, "colors": [{"id": "c40", "name": "Black", "unavailable": false, "suggest": "", "q": {"S": 1, "M": 9, "L": 2}}]}, {"id": "i5", "name": "Staff Crewneck Sweatshirt", "blank": "ATC™ Everyday Fleece Crewneck Sweatshirt", "printing": "Logo on front center (10\" x 5.5\")\n\"STAFF\" on back (11\" x 5.5\")", "base": 28, "prices": {"XXL": 32}, "colors": [{"id": "c50", "name": "Black", "unavailable": false, "suggest": "", "q": {"L": 2}}, {"id": "c51", "name": "Navy", "unavailable": false, "suggest": "", "q": {"L": 1}}, {"id": "c52", "name": "Camel", "unavailable": true, "suggest": "", "q": {"L": 1}}]}], "discount": {"type": "pct", "value": 0}, "taxRate": 0, "deposit": {"type": "pct", "value": 0}, "notes": "The price includes the clothing and all the printing listed for each item.\nSmall to XL are one price. XXL is a larger size, so it costs a little more.\nShipping is not included in this total. We will send you the shipping cost separately.\nBefore we print, we will send you a picture of the design to approve.", "closing": "Happy with this quote? Just reply to the email and say “Approved.”", "createdAt": 1793403444926, "updatedAt": 1793403444926, "summary": {"pieces": 76, "total": 1970, "items": "Hoodie, Sweatpants, Staff Hoodie, Staff T-Shirt, Staff Crewneck Sweatshirt"}}'::jsonb, 1793403444926) on conflict (id) do nothing;

-- Done! You should see "Success. No rows returned".
