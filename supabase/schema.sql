-- Just Pray database. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates what is missing.
--
-- Only the server (Netlify Functions, using the secret key) can read or write these tables.
-- Row Level Security is on and there are no policies, so the public API keys get nothing.

create table if not exists public.events (
  id bigint generated always as identity primary key,
  title text not null,
  date date not null,
  time text not null,
  venue text not null,
  capacity integer not null check (capacity between 1 and 10000),
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

-- At most one current gathering.
create unique index if not exists events_one_current on public.events (is_current) where is_current;

create table if not exists public.reservations (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events (id) on delete cascade,
  seat integer not null,
  code text not null,
  name text not null,
  email text not null,
  phone text not null,
  updates boolean not null default false,
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  -- SHA-256 of the private token in the "Cancel my seat" link. The token itself is never stored.
  cancel_hash text,
  unique (event_id, email),
  unique (event_id, seat),
  unique (event_id, code)
);

create table if not exists public.contributions (
  id bigint generated always as identity primary key,
  reference text not null unique,
  name text not null,
  email text not null,
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  marked_sent_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- For databases created before dollar contributions existed.
alter table public.contributions
  add column if not exists currency text not null default 'NGN' check (currency in ('NGN', 'USD'));

create index if not exists contributions_created_at on public.contributions (created_at desc);

-- For databases created before people could cancel their own seat.
alter table public.reservations
  add column if not exists status text not null default 'active' check (status in ('active', 'cancelled'));
alter table public.reservations add column if not exists cancelled_at timestamptz;
alter table public.reservations add column if not exists cancel_hash text;
create unique index if not exists reservations_cancel_hash
  on public.reservations (cancel_hash) where cancel_hash is not null;

alter table public.events enable row level security;
alter table public.reservations enable row level security;
alter table public.contributions enable row level security;

revoke all on public.events, public.reservations, public.contributions from anon, authenticated;
grant all on public.events, public.reservations, public.contributions to service_role;

-- Reserve a seat for the current gathering. Locking the event row makes concurrent
-- reservations wait their turn, so capacity can never be exceeded. Only active (not
-- cancelled) reservations count toward capacity.
--   status 'created'  : a new seat, or a cancelled one brought back; seat and code are set
--   status 'existing' : this email already has a seat; seat and code are set
--   status 'full'     : no seats left
--   status 'no_event' : no current gathering is set up
-- The earlier version had no p_cancel_hash. It is replaced in one step, and the new parameter
-- has a default, so a site still running the earlier code keeps working while this runs.
drop function if exists public.reserve_seat(text, text, text, boolean);
create or replace function public.reserve_seat(
  p_name text,
  p_email text,
  p_phone text,
  p_updates boolean,
  p_cancel_hash text default null
)
returns table (
  status text,
  reservation_id bigint,
  seat integer,
  code text,
  email_sent_at timestamptz,
  reserved integer
)
language plpgsql
set search_path = public
as $$
declare
  ev public.events;
  r public.reservations;
  taken integer;
  next_seat integer;
begin
  select * into ev from public.events e where e.is_current for update;
  if not found then
    return query select 'no_event'::text, null::bigint, null::integer, null::text, null::timestamptz, 0;
    return;
  end if;

  select count(*) into taken from public.reservations x where x.event_id = ev.id and x.status = 'active';

  select * into r from public.reservations x where x.event_id = ev.id and x.email = lower(trim(p_email));
  if found and r.status = 'active' then
    return query select 'existing'::text, r.id, r.seat, r.code, r.email_sent_at, taken;
    return;
  end if;

  if taken >= ev.capacity then
    return query select 'full'::text, null::bigint, null::integer, null::text, null::timestamptz, taken;
    return;
  end if;

  -- Cancelled earlier: the same row, and so the same seat, is theirs again.
  if r.id is not null then
    update public.reservations x
    set name = trim(p_name), phone = trim(p_phone), updates = coalesce(p_updates, false),
        cancel_hash = p_cancel_hash, status = 'active', cancelled_at = null,
        email_sent_at = null, created_at = now()
    where x.id = r.id
    returning * into r;
    return query select 'created'::text, r.id, r.seat, r.code, r.email_sent_at, taken + 1;
    return;
  end if;

  select coalesce(max(x.seat), 0) + 1 into next_seat from public.reservations x where x.event_id = ev.id;

  insert into public.reservations (event_id, seat, code, name, email, phone, updates, cancel_hash)
  values (
    ev.id,
    next_seat,
    'JP-' || lpad(next_seat::text, greatest(4, length(next_seat::text)), '0'),
    trim(p_name),
    lower(trim(p_email)),
    trim(p_phone),
    coalesce(p_updates, false),
    p_cancel_hash
  )
  returning * into r;

  return query select 'created'::text, r.id, r.seat, r.code, r.email_sent_at, taken + 1;
end;
$$;

revoke execute on function public.reserve_seat(text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.reserve_seat(text, text, text, boolean, text) to service_role;

-- Change the current gathering. Takes the same row lock as reserve_seat, so a booking and a
-- capacity change can't interleave: capacity can never drop below the seats already taken.
--   status 'ok'      : saved
--   status 'too_low' : capacity is below the seats reserved; nothing changed
create or replace function public.update_current_event(
  p_title text,
  p_date date,
  p_time text,
  p_venue text,
  p_capacity integer
)
returns table (status text, reserved integer)
language plpgsql
set search_path = public
as $$
declare
  ev public.events;
  taken integer;
begin
  select * into ev from public.events e where e.is_current for update;
  if not found then
    insert into public.events (title, date, time, venue, capacity)
    values (p_title, p_date, p_time, p_venue, p_capacity);
    return query select 'ok'::text, 0;
    return;
  end if;

  select count(*) into taken from public.reservations x where x.event_id = ev.id and x.status = 'active';
  if p_capacity < taken then
    return query select 'too_low'::text, taken;
    return;
  end if;

  update public.events e
  set title = p_title, date = p_date, time = p_time, venue = p_venue, capacity = p_capacity
  where e.id = ev.id;
  return query select 'ok'::text, taken;
end;
$$;

revoke execute on function public.update_current_event(text, date, text, text, integer) from public, anon, authenticated;
grant execute on function public.update_current_event(text, date, text, text, integer) to service_role;

-- No gathering is created here. Set the title, date, time, venue and seats from the
-- organiser page (#/admin -> Event); saving there creates the gathering if none exists.
