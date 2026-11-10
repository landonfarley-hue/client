-- =====================================================================
-- Your Home Timeline — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run.
-- =====================================================================

-- ---------- agents (who can edit everything) ----------
create table if not exists public.agents (
  email text primary key
);
-- Add yourself (and any teammates) here. Use the same email you sign in with.
insert into public.agents (email) values ('landonfarley@kw.com') on conflict do nothing;

create or replace function public.is_agent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agents a where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ---------- transactions (one per home a client is buying or selling) ----------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  side text not null check (side in ('seller','buyer')),
  client_name text not null,
  client_emails text[] not null default '{}',
  client_phones text[] not null default '{}',
  address text not null default '',
  city text not null default '',
  price numeric,
  beds numeric, baths numeric, sqft numeric,
  status_label text not null default '',
  photo_url text not null default '',
  mls_url text not null default '',
  target_date date,
  alerts_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.can_view(tx uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_agent() or exists (
    select 1 from public.transactions t
    where t.id = tx and lower(coalesce(auth.jwt() ->> 'email','')) = any (t.client_emails)
  );
$$;

-- keep client emails lowercase so matching always works
create or replace function public.tx_normalize() returns trigger language plpgsql as $$
begin
  new.client_emails := array(select distinct lower(trim(e)) from unnest(new.client_emails) e where trim(e) <> '');
  return new;
end $$;
drop trigger if exists tx_normalize on public.transactions;
create trigger tx_normalize before insert or update on public.transactions
  for each row execute function public.tx_normalize();

-- ---------- steps (the checklist) ----------
create table if not exists public.steps (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  position int not null,
  title text not null,
  description text not null default '',
  done boolean not null default false,
  done_at timestamptz,
  due_date date
);
create index if not exists steps_tx on public.steps(transaction_id, position);

-- ---------- showing feedback (sellers) ----------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  showing_date date not null default current_date,
  showing_agent text not null default '',
  interest int check (interest between 1 and 5),
  price_opinion text check (price_opinion in ('low','right','high')),
  comments text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists feedback_tx on public.feedback(transaction_id);

-- ---------- open houses (sellers) ----------
create table if not exists public.open_houses (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  date date not null default current_date,
  time_range text not null default '',
  visitors int not null default 0,
  interested int not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists oh_tx on public.open_houses(transaction_id);

-- ---------- events (activity feed; every new row = an alert) ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  kind text not null default 'note' check (kind in ('welcome','step','feedback','open_house','note')),
  title text not null,
  body text not null default '',
  recipients text[],            -- null = all clients on the home; set = only these emails (used for invites)
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.events add column if not exists recipients text[];
create index if not exists events_tx on public.events(transaction_id, created_at desc);

-- ---------- row-level security ----------
alter table public.agents enable row level security;
alter table public.transactions enable row level security;
alter table public.steps enable row level security;
alter table public.feedback enable row level security;
alter table public.open_houses enable row level security;
alter table public.events enable row level security;

drop policy if exists "agents read self" on public.agents;
create policy "agents read self" on public.agents for select using (public.is_agent());

drop policy if exists "view tx" on public.transactions;
create policy "view tx" on public.transactions for select using (public.can_view(id));
drop policy if exists "agent writes tx" on public.transactions;
create policy "agent writes tx" on public.transactions for all using (public.is_agent()) with check (public.is_agent());

do $$
declare t text;
begin
  foreach t in array array['steps','feedback','open_houses','events'] loop
    execute format('drop policy if exists "view %1$s" on public.%1$s', t);
    execute format('create policy "view %1$s" on public.%1$s for select using (public.can_view(transaction_id))', t);
    execute format('drop policy if exists "agent writes %1$s" on public.%1$s', t);
    execute format('create policy "agent writes %1$s" on public.%1$s for all using (public.is_agent()) with check (public.is_agent())', t);
  end loop;
end $$;

-- ---------- automatic activity + alerts ----------
create or replace function public.ev_on_step() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or not coalesce(old.done, false)) then
    insert into public.events (transaction_id, kind, title, body)
    values (new.transaction_id, 'step', 'Completed: ' || new.title, new.description);
  end if;
  return new;
end $$;
drop trigger if exists ev_on_step on public.steps;
create trigger ev_on_step after insert or update of done on public.steps
  for each row execute function public.ev_on_step();

create or replace function public.ev_on_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.events (transaction_id, kind, title, body)
  values (new.transaction_id, 'feedback', 'New showing feedback', new.comments);
  return new;
end $$;
drop trigger if exists ev_on_feedback on public.feedback;
create trigger ev_on_feedback after insert on public.feedback
  for each row execute function public.ev_on_feedback();

create or replace function public.ev_on_open_house() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.events (transaction_id, kind, title, body)
  values (new.transaction_id, 'open_house', 'Open house recap: ' || new.visitors || ' visitors', new.notes);
  return new;
end $$;
drop trigger if exists ev_on_open_house on public.open_houses;
create trigger ev_on_open_house after insert on public.open_houses
  for each row execute function public.ev_on_open_house();

-- New portal: welcome/invite email to every client email, plus a confirmation to the agent
create or replace function public.ev_on_tx() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.events (transaction_id, kind, title, body)
  values (new.id, 'welcome', 'Your home timeline is ready',
          'Follow every step of your ' || case when new.side = 'seller' then 'sale' else 'purchase' end || ' here.');
  return new;
end $$;
drop trigger if exists ev_on_tx on public.transactions;
create trigger ev_on_tx after insert on public.transactions
  for each row execute function public.ev_on_tx();

-- Email added to an existing client later: invite only the new address(es)
create or replace function public.ev_on_tx_emails() returns trigger
language plpgsql security definer set search_path = public as $$
declare added text[];
begin
  select coalesce(array_agg(e), '{}') into added
    from unnest(new.client_emails) e where not (e = any (old.client_emails));
  if array_length(added, 1) > 0 then
    insert into public.events (transaction_id, kind, title, body, recipients)
    values (new.id, 'welcome', 'Your home timeline is ready',
            'Follow every step of your ' || case when new.side = 'seller' then 'sale' else 'purchase' end || ' here.', added);
  end if;
  return new;
end $$;
drop trigger if exists ev_on_tx_emails on public.transactions;
create trigger ev_on_tx_emails after update of client_emails on public.transactions
  for each row execute function public.ev_on_tx_emails();

-- ---------- step helpers used by the agent dashboard ----------
create or replace function public.insert_step(p_transaction uuid, p_title text, p_description text, p_after int)
returns void language plpgsql security definer set search_path = public as $$
declare pos int;
begin
  if not public.is_agent() then raise exception 'not allowed'; end if;
  if p_after is null then
    select coalesce(max(position), 0) + 1 into pos from public.steps where transaction_id = p_transaction;
  else
    pos := p_after + 1;
    update public.steps set position = position + 1 where transaction_id = p_transaction and position >= pos;
  end if;
  insert into public.steps (transaction_id, position, title, description) values (p_transaction, pos, p_title, p_description);
end $$;

create or replace function public.move_step(p_step uuid, p_dir int)
returns void language plpgsql security definer set search_path = public as $$
declare s public.steps; o public.steps;
begin
  if not public.is_agent() then raise exception 'not allowed'; end if;
  select * into s from public.steps where id = p_step;
  select * into o from public.steps where transaction_id = s.transaction_id and position = s.position + p_dir;
  if o.id is null then return; end if;
  update public.steps set position = s.position where id = o.id;
  update public.steps set position = o.position where id = s.id;
end $$;

-- ---------- photo storage ----------
insert into storage.buckets (id, name, public) values ('home-photos', 'home-photos', true)
  on conflict (id) do nothing;
drop policy if exists "agents upload photos" on storage.objects;
create policy "agents upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'home-photos' and public.is_agent());
drop policy if exists "agents manage photos" on storage.objects;
create policy "agents manage photos" on storage.objects for update to authenticated
  using (bucket_id = 'home-photos' and public.is_agent());
