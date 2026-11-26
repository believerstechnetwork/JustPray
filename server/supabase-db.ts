import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  OutboxOutcome,
  AnnouncementFields,
  AnnouncementRecord,
  AudienceMember,
  AudienceScope,
  CancelLookup,
  ImportResult,
  OutboxItem,
  ContributionRecord,
  ContributionStatus,
  Db,
  EventDetails,
  NewContribution,
  NewReservation,
  ReservationRecord,
  ReserveOutcome,
  UpdateEventOutcome,
} from './types';
import { orderUpcoming } from './upcoming';

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = '23505';

/** Rows per request. Supabase caps responses (1,000 rows by default), so lists are read in pages.
 *  Pages are keyed on a column that only grows (id, seat) rather than on offsets, so a row
 *  inserted mid-read can never push another row onto the next page and be counted twice.
 *  A row committed mid-read with a lower id than the cursor can be missed; it shows up on the
 *  next read, and nothing is written back from these lists. */
const PAGE = 1000;

type Row = Record<string, unknown>;

const s = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const n = (v: unknown): number => Number(v ?? 0);
const opt = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const toEvent = (r: Row): EventDetails => ({
  title: s(r.title),
  date: s(r.date),
  time: s(r.time),
  venue: s(r.venue),
  capacity: n(r.capacity),
});

const toReservation = (r: Row): ReservationRecord => ({
  id: n(r.id),
  seat: n(r.seat),
  code: s(r.code),
  name: s(r.name),
  email: s(r.email),
  phone: s(r.phone),
  updates: r.updates === true,
  emailSentAt: opt(r.email_sent_at),
  createdAt: s(r.created_at),
  status: r.status === 'cancelled' ? 'cancelled' : 'active',
  cancelledAt: opt(r.cancelled_at),
});

/** Columns read for reservations: everything except the cancel hash. */
const RESERVATION_COLUMNS =
  'id,event_id,seat,code,name,email,phone,updates,email_sent_at,created_at,status,cancelled_at';

const toContribution = (r: Row): ContributionRecord => ({
  id: n(r.id),
  reference: s(r.reference),
  name: s(r.name),
  email: s(r.email),
  currency: s(r.currency) === 'USD' ? 'USD' : 'NGN',
  amount: n(r.amount),
  status: s(r.status) as ContributionStatus,
  markedSentAt: opt(r.marked_sent_at),
  reviewedAt: opt(r.reviewed_at),
  createdAt: s(r.created_at),
});

const optStr = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

const toAnnouncement = (r: Row): AnnouncementRecord => ({
  id: n(r.id),
  title: s(r.title),
  date: s(r.date),
  endDate: optStr(r.end_date),
  time: optStr(r.time),
  theme: optStr(r.theme),
  themeTba: r.theme_tba === true,
  venue: s(r.venue),
  venueTba: r.venue_tba === true,
  summary: s(r.summary),
  imageUrl: optStr(r.image_url),
  linkUrl: optStr(r.link_url),
  linkLabel: optStr(r.link_label),
  subject: s(r.subject),
  message: s(r.message),
  status: r.status === 'published' ? 'published' : 'draft',
  publishedAt: opt(r.published_at),
  sentCount: n(r.sent_count),
  unsentCount: n(r.unsent_count),
  audience:
    r.audience === 'booked' || r.audience === 'imported' || r.audience === 'all'
      ? r.audience
      : null,
  recipients: n(r.recipients),
  createdAt: s(r.created_at),
  emailContent:
    r.email_content && typeof r.email_content === 'object'
      ? toAnnouncement(r.email_content as Row)
      : null,
});

const announcementRow = (f: AnnouncementFields) => ({
  title: f.title,
  date: f.date,
  end_date: f.endDate,
  time: f.time,
  theme: f.theme,
  theme_tba: f.themeTba,
  venue: f.venue,
  venue_tba: f.venueTba,
  summary: f.summary,
  image_url: f.imageUrl,
  link_url: f.linkUrl,
  link_label: f.linkLabel,
  subject: f.subject,
  message: f.message,
});

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

/** Storage backed by the Supabase tables in `supabase/schema.sql`, used with the secret key. */
export class SupabaseDb implements Db {
  private readonly sb: SupabaseClient;

  /** `fetchImpl` is for tests; production uses the global fetch. */
  constructor(url: string, secretKey: string, fetchImpl?: typeof fetch) {
    this.sb = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
    });
  }

  private async currentEventRow(): Promise<Row | null> {
    const rows = check(
      await this.sb.from('events').select('*').eq('is_current', true).limit(1),
    ) as Row[];
    return rows[0] ?? null;
  }

  async currentEvent(): Promise<EventDetails | null> {
    const row = await this.currentEventRow();
    return row ? toEvent(row) : null;
  }

  async currentEventId(): Promise<number | null> {
    const row = await this.currentEventRow();
    return row ? n(row.id) : null;
  }

  async eventById(id: number): Promise<EventDetails | null> {
    const rows = check(await this.sb.from('events').select('*').eq('id', id).limit(1)) as Row[];
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async updateEvent(event: EventDetails): Promise<UpdateEventOutcome> {
    const rows = check(
      await this.sb.rpc('update_current_event', {
        p_title: event.title,
        p_date: event.date,
        p_time: event.time,
        p_venue: event.venue,
        p_capacity: event.capacity,
      }),
    ) as Row[];
    const r = rows[0];
    if (!r) throw new Error('Database error: update_current_event returned no row');
    if (s(r.status) === 'too_low') return { ok: false, reserved: n(r.reserved) };
    const saved = await this.currentEvent();
    if (!saved) throw new Error('Database error: the gathering was not saved');
    return { ok: true, event: saved };
  }

  /** Read every row, a page at a time, ascending by `key` (a column that only grows). */
  private async all(
    key: string,
    page: (after: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<Row[]> {
    const out: Row[] = [];
    let after = 0;
    for (;;) {
      const rows = check(await page(after)) as Row[];
      // Stop only on an empty page: the server may cap pages below PAGE.
      if (rows.length === 0) return out;
      out.push(...rows);
      after = n(rows[rows.length - 1]?.[key]);
    }
  }

  async reservedCount(): Promise<number> {
    const row = await this.currentEventRow();
    if (!row) return 0;
    const res = await this.sb
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', n(row.id))
      .eq('status', 'active');
    if (res.error) throw new Error(`Database error: ${res.error.message}`);
    return res.count ?? 0;
  }

  async reserve(input: NewReservation): Promise<ReserveOutcome> {
    const rows = check(
      await this.sb.rpc('reserve_seat', {
        p_name: input.name,
        p_email: input.email,
        p_phone: input.phone,
        p_updates: input.updates,
        p_cancel_hash: input.cancelHash,
      }),
    ) as Row[];
    const r = rows[0];
    if (!r) throw new Error('Database error: reserve_seat returned no row');
    const status = s(r.status);
    const reserved = n(r.reserved);
    if (status === 'created' || status === 'existing') {
      const held = {
        id: n(r.reservation_id),
        seat: n(r.seat),
        code: s(r.code),
        emailSentAt: opt(r.email_sent_at),
        reserved,
      };
      return status === 'created' ? { status, ...held } : { status, ...held };
    }
    if (status === 'full') return { status, reserved };
    if (status === 'no_event') return { status, reserved };
    throw new Error(`Database error: unexpected reserve status ${status}`);
  }

  async markEmailSent(reservationId: number, cancelHash: string): Promise<void> {
    check(
      await this.sb
        .from('reservations')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', reservationId)
        .eq('cancel_hash', cancelHash),
    );
  }

  async markEmailFailed(reservationId: number, cancelHash: string): Promise<void> {
    check(
      await this.sb
        .from('reservations')
        .update({ email_failed_at: new Date().toISOString() })
        .eq('id', reservationId)
        .eq('cancel_hash', cancelHash)
        .is('email_sent_at', null),
    );
  }

  async claimEmailRetry(reservationId: number, cancelHash: string): Promise<boolean> {
    // One conditional update, so two requests at once cannot both claim the re-send. A booking
    // with no hash at all predates cancel links; its earlier email counts as failed if unsent.
    const rows = check(
      await this.sb
        .from('reservations')
        .update({ cancel_hash: cancelHash, email_failed_at: null })
        .eq('id', reservationId)
        .eq('status', 'active')
        .is('email_sent_at', null)
        .or('email_failed_at.not.is.null,cancel_hash.is.null')
        .select('id'),
    ) as Row[];
    return rows.length > 0;
  }

  async findByCancelHash(cancelHash: string): Promise<CancelLookup | null> {
    const rows = check(
      await this.sb
        .from('reservations')
        .select(RESERVATION_COLUMNS)
        .eq('cancel_hash', cancelHash)
        .limit(1),
    ) as unknown as Row[];
    const r = rows[0];
    if (!r) return null;
    const events = check(
      await this.sb.from('events').select('*').eq('id', n(r.event_id)).limit(1),
    ) as Row[];
    const ev = events[0];
    if (!ev) return null;
    return { reservation: toReservation(r), event: toEvent(ev), current: ev.is_current === true };
  }

  async cancelReservation(reservationId: number, cancelHash: string): Promise<boolean> {
    const rows = check(
      await this.sb
        .from('reservations')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', reservationId)
        .eq('status', 'active')
        .eq('cancel_hash', cancelHash)
        .select('id'),
    ) as Row[];
    return rows.length > 0;
  }

  async listReservations(): Promise<ReservationRecord[]> {
    const row = await this.currentEventRow();
    if (!row) return [];
    const eventId = n(row.id);
    const rows = await this.all('seat', (after) =>
      this.sb
        .from('reservations')
        .select(RESERVATION_COLUMNS)
        .eq('event_id', eventId)
        .gt('seat', after)
        .order('seat', { ascending: true })
        .limit(PAGE),
    );
    return rows.map(toReservation);
  }

  async createContribution(input: NewContribution): Promise<ContributionRecord | null> {
    const res = await this.sb.from('contributions').insert(input).select().single();
    if (res.error?.code === UNIQUE_VIOLATION) return null;
    return toContribution(check(res) as Row);
  }

  async markContributionSent(reference: string): Promise<ContributionRecord | null> {
    const rows = check(
      await this.sb
        .from('contributions')
        .update({ marked_sent_at: new Date().toISOString() })
        .eq('reference', reference)
        .is('marked_sent_at', null)
        .select(),
    ) as Row[];
    if (rows[0]) return toContribution(rows[0]);
    // Already marked: return it unchanged.
    const existing = check(
      await this.sb.from('contributions').select('*').eq('reference', reference).limit(1),
    ) as Row[];
    return existing[0] ? toContribution(existing[0]) : null;
  }

  async setContributionStatus(
    id: number,
    status: ContributionStatus,
  ): Promise<ContributionRecord | null> {
    const rows = check(
      await this.sb
        .from('contributions')
        .update({ status, reviewed_at: status === 'pending' ? null : new Date().toISOString() })
        .eq('id', id)
        .select(),
    ) as Row[];
    return rows[0] ? toContribution(rows[0]) : null;
  }

  async listContributions(): Promise<ContributionRecord[]> {
    const rows = await this.all('id', (after) =>
      this.sb
        .from('contributions')
        .select('*')
        .gt('id', after)
        .order('id', { ascending: true })
        .limit(PAGE),
    );
    // Newest first for the ledger: by creation time, then id. (Id order alone can differ from
    // creation order by a few milliseconds when contributions arrive at the same moment.)
    // Compare parsed times, not strings: PostgREST drops trailing zeros from fractional
    // seconds ("…:00.5+00:00" vs "…:00.45+00:00"), so string order can be wrong.
    const time = (iso: string): number => Date.parse(iso) || 0;
    return rows
      .map(toContribution)
      .sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id);
  }

  async listAnnouncements(): Promise<AnnouncementRecord[]> {
    const rows = await this.all('id', (after) =>
      this.sb
        .from('announcements')
        .select('*')
        .gt('id', after)
        .order('id', { ascending: true })
        .limit(PAGE),
    );
    return rows.map(toAnnouncement).reverse();
  }

  async createAnnouncement(fields: AnnouncementFields): Promise<AnnouncementRecord> {
    const row = check(
      await this.sb.from('announcements').insert(announcementRow(fields)).select().single(),
    ) as Row;
    return toAnnouncement(row);
  }

  async updateAnnouncement(
    id: number,
    fields: AnnouncementFields,
  ): Promise<AnnouncementRecord | null> {
    const rows = check(
      await this.sb.from('announcements').update(announcementRow(fields)).eq('id', id).select(),
    ) as Row[];
    return rows[0] ? toAnnouncement(rows[0]) : null;
  }

  async deleteDraftAnnouncement(id: number): Promise<boolean> {
    const rows = check(
      await this.sb.from('announcements').delete().eq('id', id).eq('status', 'draft').select('id'),
    ) as Row[];
    return rows.length > 0;
  }

  async announcementById(id: number): Promise<AnnouncementRecord | null> {
    const rows = check(
      await this.sb.from('announcements').select('*').eq('id', id).limit(1),
    ) as Row[];
    return rows[0] ? toAnnouncement(rows[0]) : null;
  }

  async publishAnnouncement(id: number, scope: AudienceScope): Promise<AnnouncementRecord | null> {
    // One database function publishes and queues the emails together, and only from a draft,
    // so two presses publish (and send) once.
    const rows = check(
      await this.sb.rpc('publish_announcement', { p_id: id, p_scope: scope }),
    ) as Row[];
    return rows[0] ? toAnnouncement(rows[0]) : null;
  }

  async claimOutbox(limit: number, dailyLimit: number): Promise<OutboxItem[]> {
    const rows = check(
      await this.sb.rpc('claim_announcement_sends', { p_limit: limit, p_daily: dailyLimit }),
    ) as Row[];
    return rows.map((r) => ({
      id: n(r.id),
      announcementId: n(r.announcement_id),
      name: s(r.name),
      email: s(r.email),
      unsubToken: s(r.unsub_token),
      claimToken: s(r.claim_token),
    }));
  }

  async beginOutbox(id: number, claimToken: string): Promise<boolean> {
    const res = check(
      await this.sb.rpc('begin_announcement_send', { p_id: id, p_token: claimToken }),
    );
    return res === true;
  }

  async finishOutbox(
    id: number,
    claimToken: string,
    outcome: OutboxOutcome,
    error?: string,
  ): Promise<void> {
    check(
      await this.sb.rpc('finish_announcement_send', {
        p_id: id,
        p_token: claimToken,
        p_outcome: outcome,
        p_error: error ?? null,
      }),
    );
  }

  async isUnsubscribed(email: string): Promise<boolean> {
    const rows = check(
      await this.sb.from('unsubscribes').select('id').eq('email', email).limit(1),
    ) as Row[];
    return rows.length > 0;
  }

  async resubscribe(token: string): Promise<string | null> {
    const email = check(await this.sb.rpc('resubscribe_by_token', { p_token: token })) as unknown;
    return typeof email === 'string' && email ? email : null;
  }

  async subscriptionByToken(token: string): Promise<{ email: string; subscribed: boolean } | null> {
    const rows = check(await this.sb.rpc('subscription_by_token', { p_token: token })) as Row[];
    const r = rows[0];
    return r ? { email: s(r.email), subscribed: r.subscribed === true } : null;
  }

  async unsubscribe(token: string): Promise<string | null> {
    const email = check(await this.sb.rpc('unsubscribe_by_token', { p_token: token })) as unknown;
    return typeof email === 'string' && email ? email : null;
  }

  async importContacts(
    people: { name: string; email: string }[],
    label: string,
    importKey: string | null = null,
  ): Promise<ImportResult> {
    const rows = check(
      await this.sb.rpc('import_contacts', {
        p_people: people,
        p_label: label,
        p_import: importKey,
      }),
    ) as Row[];
    const r = rows[0] ?? {};
    return { added: n(r.added), existing: n(r.existing), unsubscribed: n(r.unsubscribed) };
  }

  async upcomingAnnouncements(todayIso: string, limit: number): Promise<AnnouncementRecord[]> {
    // Every published event that has not ended, read a page at a time by id until a page comes
    // back empty (the server may cap a page below what was asked), so the order below sees them
    // all; there are only ever a handful.
    const rows = await this.all('id', (after) =>
      this.sb
        .from('announcements')
        .select('*')
        .eq('status', 'published')
        .or(`end_date.gte.${todayIso},and(end_date.is.null,date.gte.${todayIso})`)
        .gt('id', after)
        .order('id', { ascending: true })
        .limit(PAGE),
    );
    return orderUpcoming(rows.map(toAnnouncement), todayIso, limit);
  }

  async updatesAudience(scope: AudienceScope = 'all'): Promise<AudienceMember[]> {
    // The function returns people ordered by email; read it a page at a time (responses are
    // capped), moving past the last email seen.
    const out: AudienceMember[] = [];
    let after = '';
    for (;;) {
      const rows = check(
        await this.sb.rpc('updates_audience', { p_scope: scope, p_after: after, p_limit: PAGE }),
      ) as Row[];
      if (rows.length === 0) return out;
      for (const r of rows) out.push({ name: s(r.name), email: s(r.email), source: s(r.source) });
      after = s(rows[rows.length - 1]?.email);
    }
  }

  async ping(): Promise<void> {
    check(await this.sb.from('events').select('id').limit(1));
  }
}
