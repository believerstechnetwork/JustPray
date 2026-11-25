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
  capacity integer not null default 120 check (capacity between 1 and 10000),
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

alter table public.events enable row level security;
alter table public.reservations enable row level security;
alter table public.contributions enable row level security;

revoke all on public.events, public.reservations, public.contributions from anon, authenticated;
grant all on public.events, public.reservations, public.contributions to service_role;

-- Reserve a seat for the current gathering. Locking the event row makes concurrent
-- reservations wait their turn, so capacity can never be exceeded.
--   status 'created'  : a new seat; seat and code are set
--   status 'existing' : this email already has a seat; seat and code are set
--   status 'full'     : no seats left
--   status 'no_event' : no current gathering is set up
create or replace function public.reserve_seat(
  p_name text,
  p_email text,
  p_phone text,
  p_updates boolean
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

  select count(*) into taken from public.reservations x where x.event_id = ev.id;

  select * into r from public.reservations x where x.event_id = ev.id and x.email = lower(trim(p_email));
  if found then
    return query select 'existing'::text, r.id, r.seat, r.code, r.email_sent_at, taken;
    return;
  end if;

  if taken >= ev.capacity then
    return query select 'full'::text, null::bigint, null::integer, null::text, null::timestamptz, taken;
    return;
  end if;

  select coalesce(max(x.seat), 0) + 1 into next_seat from public.reservations x where x.event_id = ev.id;

  insert into public.reservations (event_id, seat, code, name, email, phone, updates)
  values (
    ev.id,
    next_seat,
    'JP-' || lpad(next_seat::text, 4, '0'),
    trim(p_name),
    lower(trim(p_email)),
    trim(p_phone),
    coalesce(p_updates, false)
  )
  returning * into r;

  return query select 'created'::text, r.id, r.seat, r.code, r.email_sent_at, taken + 1;
end;
$$;

revoke execute on function public.reserve_seat(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.reserve_seat(text, text, text, boolean) to service_role;

-- The first gathering. Edit it later from the organiser page (#/admin -> Event).
insert into public.events (title, date, time, venue, capacity)
select 'Just Pray · A Gathering of Hearts', date '2027-01-30', '4:00 PM WAT', 'Venue to be announced, Lagos', 120
where not exists (select 1 from public.events);
