-- Just Pray database. Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run again: it only creates what is missing.
-- Best run when no announcement is sending (none shows "Sending" in the admin list) and nobody is
-- publishing. To keep it safe even while the sender runs, the script first takes the announcement
-- tables (below), so a send or an import that comes along simply waits for the update to finish.
-- If an email is being sent at that moment, or the tables are busy, it stops and changes nothing:
-- wait two minutes and run it again. Do the same if PostgreSQL stops it with a deadlock. Nothing
-- is ever sent twice.
--
-- Only the server (Netlify Functions, using the secret key) can read or write these tables.
-- Row Level Security is on and there are no policies, so the public API keys get nothing.

-- On a database that already has the announcement tables, lock them all before changing
-- anything. A send, publish, unsubscribe or import that comes along meanwhile then waits at its
-- first step instead of holding one table while this script waits for it. (A fresh install has
-- nothing to lock.) The SQL Editor runs the whole script as one transaction, so the locks last
-- until it ends, and stopping with an error below lets them go straight away.
do $$
declare
  tables text;
  in_flight boolean := false;
  locked boolean := false;
begin
  tables := concat_ws(', ',
    case when to_regclass('public.announcement_sends') is not null then 'public.announcement_sends' end,
    case when to_regclass('public.announcements') is not null then 'public.announcements' end,
    case when to_regclass('public.contacts') is not null then 'public.contacts' end,
    case when to_regclass('public.unsubscribes') is not null then 'public.unsubscribes' end,
    case when to_regclass('public.import_batches') is not null then 'public.import_batches' end);
  if tables = '' then
    return;
  end if;
  -- A lock statement takes its tables one after the other, so a plain one could hold the first
  -- while it waits for the next, and a send finishing meanwhile would wait behind it. With nowait,
  -- a try that cannot take them all at once takes none (the failed try's locks are let go with
  -- it), and the script tries again shortly, for about five seconds, holding nothing in between.
  for attempt in 1 .. 50 loop
    begin
      execute format('lock table %s in access exclusive mode nowait', tables);
      locked := true;
      exit;
    exception when lock_not_available then
      perform pg_sleep(0.1);
    end;
  end loop;
  if not locked then
    raise exception 'The announcement tables are busy right now, so nothing was changed.'
      using hint = 'Wait two minutes, then run this script again.';
  end if;
  -- If an email is being sent, stop: the send's next step would wait for this script, and a send
  -- stopped while waiting would be closed as failed even if the email went out. A run lasts under
  -- a minute, so a claim from the last two minutes belongs to a live run. (Older versions of the
  -- table have no claimed_at, and no claims either.)
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'announcement_sends'
               and column_name = 'claimed_at') then
    execute $q$
      select exists (select 1 from public.announcement_sends
                     where status in ('claimed', 'sending')
                       and claimed_at > now() - interval '2 minutes')
    $q$ into in_flight;
  end if;
  if in_flight then
    raise exception 'An announcement email is being sent right now, so nothing was changed.'
      using hint = 'Wait two minutes, then run this script again.';
  end if;
end;
$$;

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
  -- Set when the confirmation email could not be sent, so a later booking attempt may re-send it.
  email_failed_at timestamptz,
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
alter table public.reservations add column if not exists email_failed_at timestamptz;
create unique index if not exists reservations_cancel_hash
  on public.reservations (cancel_hash) where cancel_hash is not null;

-- Other BTN events (not Just Pray gatherings), announced by email and listed on the site.
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null,
  date date not null,
  end_date date,
  time text,
  theme text,
  theme_tba boolean not null default false,
  venue text not null default '',
  venue_tba boolean not null default false,
  summary text not null,
  image_url text,
  link_url text,
  link_label text,
  subject text not null,
  message text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  sent_count integer not null default 0,
  -- Emails closed without delivery: failed for good, or skipped because the person unsubscribed.
  unsent_count integer not null default 0,
  recipients integer not null default 0,
  audience text check (audience in ('all', 'booked', 'imported')),
  -- The email exactly as published; every batch sends this, so later edits to the published
  -- event change the home page only.
  email_content jsonb,
  created_at timestamptz not null default now()
);
alter table public.announcements add column if not exists email_content jsonb;
-- Announcements published before the snapshot existed keep the email as it is now.
update public.announcements a
set email_content = to_jsonb(a) - 'email_content'
where a.status = 'published' and a.email_content is null;

-- People who unsubscribed from announcements. They are never emailed one again.
create table if not exists public.unsubscribes (
  id bigint generated always as identity primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- People added from an Excel import. They get announcements until they unsubscribe.
create table if not exists public.contacts (
  id bigint generated always as identity primary key,
  name text not null default '',
  email text not null unique,
  -- The label given to the import, e.g. "BTN Conference 2026 attendees".
  source text not null default 'Imported',
  created_at timestamptz not null default now()
);
-- The result of each batch of an import, by the random key the organiser's page gives all the
-- batches of one import and a hash of the batch. A batch sent again after its reply was lost gets
-- back the result it had the first time, whatever has changed since. Kept for 7 days; the page
-- only resumes an import within a day of starting it (IMPORT_RESUME_MS), well inside that.
create table if not exists public.import_batches (
  import_key text not null,
  batch_hash text not null,
  added integer,
  existing integer,
  unsubscribed integer,
  created_at timestamptz not null default now(),
  primary key (import_key, batch_hash)
);
-- An earlier draft of this kept the key on each contact instead; it is no longer used.
alter table public.contacts drop column if exists import_key;

-- The outbox: one row per person per published announcement, sent in small batches.
create table if not exists public.announcement_sends (
  id bigint generated always as identity primary key,
  announcement_id bigint not null references public.announcements (id) on delete cascade,
  name text not null default '',
  email text not null,
  -- Private token in this person's unsubscribe link.
  unsub_token text not null unique,
  -- pending: queued; claimed: taken by a run, not yet being sent; sending: being sent now.
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  -- Proves which run holds a claim; only that run may start sending it.
  claim_token text,
  sent_at timestamptz,
  -- When the last attempt ended (sent, failed or given up as stale).
  finished_at timestamptz,
  error text,
  unique (announcement_id, email)
);
alter table public.announcement_sends add column if not exists finished_at timestamptz;
alter table public.announcement_sends add column if not exists claim_token text;
alter table public.announcement_sends drop constraint if exists announcement_sends_status_check;
alter table public.announcement_sends add constraint announcement_sends_status_check
  check (status in ('pending', 'claimed', 'sending', 'sent', 'failed', 'skipped'));
create index if not exists announcement_sends_pending
  on public.announcement_sends (id) where status = 'pending';
create index if not exists announcement_sends_sent_at
  on public.announcement_sends (sent_at) where sent_at is not null;

-- Keep each announcement's unsent_count in step with its sends, whichever step closes one as
-- failed or skipped (a send, a run that died, an unsubscribe), so the organisers can tell a
-- finished run with a few undelivered emails from one still going.
alter table public.announcements add column if not exists unsent_count integer not null default 0;
create or replace function public.count_unsent_announcement_send()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('failed', 'skipped') and old.status not in ('failed', 'skipped') then
    update public.announcements a set unsent_count = a.unsent_count + 1
    where a.id = new.announcement_id;
  elsif old.status in ('failed', 'skipped') and new.status not in ('failed', 'skipped') then
    update public.announcements a set unsent_count = greatest(0, a.unsent_count - 1)
    where a.id = new.announcement_id;
  end if;
  return new;
end;
$$;
drop trigger if exists announcement_sends_unsent on public.announcement_sends;
create trigger announcement_sends_unsent
  after update of status on public.announcement_sends
  for each row execute function public.count_unsent_announcement_send();
revoke execute on function public.count_unsent_announcement_send() from public, anon, authenticated;
-- Count the ones closed before this column existed. Each announcement is locked before its sends
-- are counted (the count is a new statement, so it sees every send already finished), and a send
-- finishing meanwhile waits for the lock, then adds to the stored count: none is lost.
do $$
declare
  r record;
begin
  for r in select a.id from public.announcements a where a.status = 'published' loop
    perform 1 from public.announcements a where a.id = r.id for update;
    update public.announcements a
    set unsent_count = (
      select count(*) from public.announcement_sends s
      where s.announcement_id = r.id and s.status in ('failed', 'skipped')
    )
    where a.id = r.id;
  end loop;
end;
$$;

alter table public.announcements enable row level security;
alter table public.unsubscribes enable row level security;
alter table public.contacts enable row level security;
alter table public.announcement_sends enable row level security;
alter table public.import_batches enable row level security;
revoke all on public.announcements, public.unsubscribes, public.contacts, public.announcement_sends,
  public.import_batches from anon, authenticated;
grant all on public.announcements, public.unsubscribes, public.contacts, public.announcement_sends,
  public.import_batches to service_role;

-- Who gets announcements, one row per email, ordered by email and read a page at a time:
--   p_scope 'booked'   : people who booked a seat and asked to hear about future events
--   p_scope 'imported' : people added from an Excel import
--   p_scope 'all'      : both (someone on both lists appears once, as "Booked a seat")
-- Anyone who unsubscribed is left out.
create or replace function public.updates_audience(
  p_scope text default 'all',
  p_after text default '',
  p_limit integer default 1000
)
returns table (name text, email text, source text)
language sql
stable
set search_path = public
as $$
  select q.name, q.email, q.source from (
    select distinct on (p.email) p.name, p.email, p.source
    from (
      select r.name, r.email, 'Booked a seat'::text as source, 0 as rank
      from public.reservations r
      where r.updates and p_scope in ('all', 'booked')
      union all
      select c.name, c.email, c.source, 1
      from public.contacts c
      where p_scope in ('all', 'imported')
    ) p
    where p.email > p_after
      and not exists (select 1 from public.unsubscribes u where u.email = p.email)
    order by p.email, p.rank
  ) q
  order by q.email
  limit p_limit;
$$;

-- Publish a draft and queue one email per person, in one step. Returns nothing when the
-- announcement is unknown or already published, so pressing Publish twice sends once.
create or replace function public.publish_announcement(p_id bigint, p_scope text)
returns setof public.announcements
language plpgsql
set search_path = public
as $$
declare
  queued integer;
begin
  perform 1 from public.announcements a where a.id = p_id and a.status = 'draft' for update;
  if not found then
    return;
  end if;
  insert into public.announcement_sends (announcement_id, name, email, unsub_token)
  select p_id, x.name, x.email,
         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  from public.updates_audience(p_scope, '', 2147483647) x
  on conflict (announcement_id, email) do nothing;
  get diagnostics queued = row_count;
  return query
    update public.announcements a
    set status = 'published', published_at = now(), recipients = queued, audience = p_scope,
        email_content = (select to_jsonb(x) - 'email_content' from public.announcements x
                         where x.id = p_id)
    where a.id = p_id
    returning a.*;
end;
$$;

-- Claim the next batch of queued emails, never more than p_daily sent (or being sent) in the
-- last 24 hours. The lock makes overlapping runs take turns, so the daily limit holds.
-- A claim is in two steps: claimed here, then switched to sending (begin_announcement_send) just
-- before the email goes out, by the run holding the claim token.
drop function if exists public.claim_announcement_sends(integer, integer);
create or replace function public.claim_announcement_sends(p_limit integer, p_daily integer)
returns table (
  id bigint, announcement_id bigint, name text, email text, unsub_token text, claim_token text
)
language plpgsql
set search_path = public
as $$
declare
  sent_today integer;
  take integer;
begin
  perform pg_advisory_xact_lock(727211);
  -- A claim older than 10 minutes that never started sending: nothing went out, so it goes back
  -- in the queue (its old token stops working).
  update public.announcement_sends s
  set status = 'pending', claim_token = null
  where s.status = 'claimed' and s.claimed_at < now() - interval '10 minutes';
  -- A send that started more than 10 minutes ago belongs to a run that died, maybe after the
  -- email went out. Close it as failed rather than risk sending it twice.
  update public.announcement_sends s
  set status = 'failed', attempts = s.attempts + 1, error = 'Sending did not finish',
      finished_at = now()
  where s.status = 'sending' and s.claimed_at < now() - interval '10 minutes';
  -- Anyone who unsubscribed since publishing gets nothing more.
  update public.announcement_sends s
  set status = 'skipped'
  where s.status = 'pending'
    and exists (select 1 from public.unsubscribes u where u.email = s.email);
  -- Emails claimed or being sent right now, and failed ones whose attempt ended in the last 24
  -- hours (a run that died or a timeout may still have delivered them), count toward today's
  -- limit too.
  select count(*) into sent_today
  from public.announcement_sends s
  where s.sent_at > now() - interval '24 hours'
     or s.status in ('claimed', 'sending')
     or (s.status = 'failed'
         and coalesce(s.finished_at, s.claimed_at) > now() - interval '24 hours');
  take := greatest(0, least(p_limit, p_daily - sent_today));
  return query
    update public.announcement_sends s
    set status = 'claimed', claimed_at = now(),
        claim_token = md5(random()::text || clock_timestamp()::text || s.id::text)
    where s.id in (
      select s2.id from public.announcement_sends s2
      where s2.status = 'pending'
        -- A row can come back to pending after the skip above ran (a refused send being retried):
        -- never spend today's allowance on someone who has unsubscribed. The next run skips it.
        and not exists (select 1 from public.unsubscribes u where u.email = s2.email)
      -- Fresh emails first; ones being retried wait behind them.
      order by s2.attempts, s2.id
      limit take
      for update skip locked
    )
    returning s.id, s.announcement_id, s.name, s.email, s.unsub_token, s.claim_token;
end;
$$;

-- Start sending one claimed email: true only for the run that still holds the claim. A run that
-- stalled past its claim (now back in the queue, or taken by another run) gets false and must
-- not send.
create or replace function public.begin_announcement_send(p_id bigint, p_token text)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  -- A claim older than 10 minutes has expired even if no run has tidied it up yet: refuse it in
  -- the same step, so the lease never depends on which run gets there first.
  update public.announcement_sends s
  set status = 'sending', claimed_at = now()
  where s.id = p_id and s.status = 'claimed' and s.claim_token = p_token
    and s.claimed_at >= now() - interval '10 minutes';
  return found;
end;
$$;

-- Record what happened to one claimed email:
--   sent     delivered, and counted on the announcement;
--   retry    nothing went out: back in the queue, failed after 3 attempts in all;
--   failed   closed and never retried (it may have gone out, or can never go);
--   skipped  closed unsent, because the person unsubscribed;
--   later    not sent because the mail service's quota is used up: back in the queue, no attempt used.
-- Only a row still claimed (or being sent) by the run holding p_token changes: a run whose claim
-- expired can never touch an email another run has taken since.
drop function if exists public.finish_announcement_send(bigint, boolean, text);
drop function if exists public.finish_announcement_send(bigint, boolean, text, boolean);
drop function if exists public.finish_announcement_send(bigint, text, text);
create or replace function public.finish_announcement_send(
  p_id bigint,
  p_token text,
  p_outcome text,
  p_error text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  ann bigint;
begin
  if p_outcome = 'sent' then
    update public.announcement_sends s
    set status = 'sent', sent_at = now(), finished_at = now(), attempts = s.attempts + 1,
        error = null
    where s.id = p_id and s.status in ('claimed', 'sending') and s.claim_token = p_token
    returning s.announcement_id into ann;
    if ann is not null then
      update public.announcements a set sent_count = a.sent_count + 1 where a.id = ann;
    end if;
  elsif p_outcome = 'skipped' then
    update public.announcement_sends s
    set status = 'skipped', error = left(p_error, 200), finished_at = now()
    where s.id = p_id and s.status in ('claimed', 'sending') and s.claim_token = p_token;
  elsif p_outcome = 'retry' then
    update public.announcement_sends s
    set attempts = s.attempts + 1,
        error = left(p_error, 200),
        finished_at = now(),
        status = case when s.attempts + 1 >= 3 then 'failed' else 'pending' end
    where s.id = p_id and s.status in ('claimed', 'sending') and s.claim_token = p_token;
  elsif p_outcome = 'later' then
    -- The mail service's quota is used up: back in the queue, without using an attempt.
    update public.announcement_sends s
    set status = 'pending', error = left(p_error, 200), finished_at = now()
    where s.id = p_id and s.status in ('claimed', 'sending') and s.claim_token = p_token;
  elsif p_outcome = 'failed' then
    update public.announcement_sends s
    set attempts = s.attempts + 1, error = left(p_error, 200), status = 'failed',
        finished_at = now()
    where s.id = p_id and s.status in ('claimed', 'sending') and s.claim_token = p_token;
  else
    raise exception 'Unknown send outcome: %', p_outcome;
  end if;
end;
$$;

-- Unsubscribe the person behind an unsubscribe link; their queued emails are skipped.
create or replace function public.unsubscribe_by_token(p_token text)
returns text
language plpgsql
set search_path = public
as $$
declare
  who text;
begin
  -- Take turns with claim_announcement_sends (same lock), which also changes send rows and the
  -- announcement's counts; without it the two could each wait on a row the other holds.
  perform pg_advisory_xact_lock(727211);
  select s.email into who from public.announcement_sends s where s.unsub_token = p_token;
  if who is null then
    return null;
  end if;
  insert into public.unsubscribes (email) values (who) on conflict (email) do nothing;
  update public.announcement_sends s set status = 'skipped'
  where s.email = who and s.status = 'pending';
  return who;
end;
$$;

-- Undo an unsubscribe from the same link (the email preferences page). Emails skipped while
-- they were unsubscribed are not sent afterwards.
create or replace function public.resubscribe_by_token(p_token text)
returns text
language plpgsql
set search_path = public
as $$
declare
  who text;
begin
  select s.email into who from public.announcement_sends s where s.unsub_token = p_token;
  if who is null then
    return null;
  end if;
  delete from public.unsubscribes u where u.email = who;
  return who;
end;
$$;

-- Who an unsubscribe link belongs to, and whether they still get announcements.
create or replace function public.subscription_by_token(p_token text)
returns table (email text, subscribed boolean)
language sql
stable
set search_path = public
as $$
  select s.email, not exists (select 1 from public.unsubscribes u where u.email = s.email)
  from public.announcement_sends s
  where s.unsub_token = p_token
  limit 1;
$$;

-- Add people from an Excel import. p_people is a JSON array of {name, email}. Counts:
-- added (new), existing (already on the list) and unsubscribed (not added back).
-- With p_import (the import's key), each batch's result is stored, so a batch sent again after
-- its reply was lost gets back the same counts. Replaced: the version without the key.
drop function if exists public.import_contacts(jsonb, text);
create or replace function public.import_contacts(
  p_people jsonb,
  p_label text,
  p_import text default null
)
returns table (added integer, existing integer, unsubscribed integer)
language plpgsql
set search_path = public
as $$
declare
  total integer;
  blocked integer;
  n_added integer;
  batch text := md5(p_people::text);
begin
  -- With a key, a batch already done (sent again after its reply was lost) gets back the result
  -- it had the first time. A first try still in progress makes this insert wait for it; if that
  -- try is saved, the stored result is returned, and if it failed, this one does the work.
  if p_import is not null then
    delete from public.import_batches b where b.created_at < now() - interval '7 days';
    insert into public.import_batches (import_key, batch_hash) values (p_import, batch)
    on conflict do nothing;
    if not found then
      return query
        select b.added, b.existing, b.unsubscribed from public.import_batches b
        where b.import_key = p_import and b.batch_hash = batch;
      return;
    end if;
  end if;
  -- Each address is checked against the unsubscribe list once, here, and every count below
  -- comes from that one check, so a change made meanwhile cannot make the totals disagree.
  create temp table import_in on commit drop as
    select d.name, d.email,
           exists (select 1 from public.unsubscribes u where u.email = d.email) as blocked
    from (
      select distinct on (lower(trim(x->>'email')))
        coalesce(trim(x->>'name'), '') as name, lower(trim(x->>'email')) as email
      from jsonb_array_elements(p_people) x
      where coalesce(trim(x->>'email'), '') <> ''
    ) d;
  select count(*), count(*) filter (where i.blocked) into total, blocked from import_in i;
  insert into public.contacts (name, email, source)
  select i.name, i.email, p_label from import_in i
  where not i.blocked
  on conflict (email) do nothing;
  get diagnostics n_added = row_count;
  if p_import is not null then
    update public.import_batches b
    set added = n_added, existing = total - n_added - blocked, unsubscribed = blocked
    where b.import_key = p_import and b.batch_hash = batch;
  end if;
  return query select n_added, total - n_added - blocked, blocked;
end;
$$;

revoke execute on function public.updates_audience(text, text, integer) from public, anon, authenticated;
revoke execute on function public.publish_announcement(bigint, text) from public, anon, authenticated;
revoke execute on function public.claim_announcement_sends(integer, integer) from public, anon, authenticated;
revoke execute on function public.begin_announcement_send(bigint, text) from public, anon, authenticated;
revoke execute on function public.finish_announcement_send(bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.unsubscribe_by_token(text) from public, anon, authenticated;
revoke execute on function public.import_contacts(jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.resubscribe_by_token(text) from public, anon, authenticated;
revoke execute on function public.subscription_by_token(text) from public, anon, authenticated;
grant execute on function public.resubscribe_by_token(text) to service_role;
grant execute on function public.subscription_by_token(text) to service_role;
grant execute on function public.updates_audience(text, text, integer) to service_role;
grant execute on function public.publish_announcement(bigint, text) to service_role;
grant execute on function public.claim_announcement_sends(integer, integer) to service_role;
grant execute on function public.begin_announcement_send(bigint, text) to service_role;
grant execute on function public.finish_announcement_send(bigint, text, text, text) to service_role;
grant execute on function public.unsubscribe_by_token(text) to service_role;
grant execute on function public.import_contacts(jsonb, text, text) to service_role;

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
        email_sent_at = null, email_failed_at = null, created_at = now()
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
