import { randomBytes } from 'node:crypto';
import type {
  OutboxOutcome,
  AnnouncementFields,
  AnnouncementRecord,
  AudienceMember,
  AudienceScope,
  CancelLookup,
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

/** In-memory storage with the same rules as `supabase/schema.sql`.
 *  Used by unit tests, local development and the end-to-end tests. */
type StoredReservation = ReservationRecord & {
  cancelHash: string | null;
  emailFailedAt: string | null;
};

/** A copy without the stored cancel hash, which never leaves the database. */
const plain = ({
  cancelHash: _hash,
  emailFailedAt: _failed,
  ...r
}: StoredReservation): ReservationRecord => ({ ...r });

export class MemoryDb implements Db {
  event: EventDetails | null;
  reservations: StoredReservation[] = [];
  contributions: ContributionRecord[] = [];
  announcements: AnnouncementRecord[] = [];
  /** Emails that unsubscribed from announcements. */
  unsubscribed = new Set<string>();
  /** People added from an Excel import. */
  contacts: AudienceMember[] = [];
  outbox: {
    id: number;
    announcementId: number;
    name: string;
    email: string;
    unsubToken: string;
    status: 'pending' | 'claimed' | 'sending' | 'sent' | 'failed' | 'skipped';
    claimToken: string | null;
    attempts: number;
    claimedAt: number;
    sentAt: number | null;
    /** When the last attempt ended. */
    finishedAt: number | null;
    error: string | null;
  }[] = [];
  private nextId = 1;
  private readonly now: () => Date;

  constructor(event: EventDetails | null, now: () => Date = () => new Date()) {
    this.event = event ? { ...event } : null;
    this.now = now;
  }

  async currentEvent(): Promise<EventDetails | null> {
    return this.event ? { ...this.event } : null;
  }

  /** The in-memory store holds one gathering, with id 1. */
  async currentEventId(): Promise<number | null> {
    return this.event ? 1 : null;
  }

  async eventById(id: number): Promise<EventDetails | null> {
    return id === 1 && this.event ? { ...this.event } : null;
  }

  private active(): ReservationRecord[] {
    return this.reservations.filter((r) => r.status === 'active');
  }

  async updateEvent(event: EventDetails): Promise<UpdateEventOutcome> {
    const taken = this.active().length;
    if (event.capacity < taken) return { ok: false, reserved: taken };
    this.event = { ...event };
    return { ok: true, event: { ...event } };
  }

  async reservedCount(): Promise<number> {
    return this.active().length;
  }

  async reserve(input: NewReservation): Promise<ReserveOutcome> {
    const taken = this.active().length;
    if (!this.event) return { status: 'no_event', reserved: 0 };
    const email = input.email.trim().toLowerCase();
    const existing = this.reservations.find((r) => r.email === email);
    if (existing?.status === 'active')
      return { status: 'existing', ...pick(existing), reserved: taken };
    if (taken >= this.event.capacity) return { status: 'full', reserved: taken };
    if (existing) {
      // Cancelled earlier: the same row, and so the same seat, is theirs again.
      Object.assign(existing, {
        name: input.name.trim(),
        phone: input.phone.trim(),
        updates: input.updates,
        cancelHash: input.cancelHash,
        status: 'active',
        cancelledAt: null,
        emailSentAt: null,
        emailFailedAt: null,
        createdAt: this.now().toISOString(),
      });
      return { status: 'created', ...pick(existing), reserved: taken + 1 };
    }
    const seat = Math.max(0, ...this.reservations.map((r) => r.seat)) + 1;
    const r: StoredReservation = {
      id: this.nextId++,
      seat,
      code: `JP-${String(seat).padStart(4, '0')}`,
      name: input.name.trim(),
      email,
      phone: input.phone.trim(),
      updates: input.updates,
      emailSentAt: null,
      createdAt: this.now().toISOString(),
      status: 'active',
      cancelledAt: null,
      cancelHash: input.cancelHash,
      emailFailedAt: null,
    };
    this.reservations.push(r);
    return { status: 'created', ...pick(r), reserved: taken + 1 };
  }

  async markEmailSent(reservationId: number, cancelHash: string): Promise<void> {
    const r = this.reservations.find((x) => x.id === reservationId);
    if (r && r.cancelHash === cancelHash) r.emailSentAt = this.now().toISOString();
  }

  async markEmailFailed(reservationId: number, cancelHash: string): Promise<void> {
    const r = this.reservations.find((x) => x.id === reservationId);
    if (r && r.cancelHash === cancelHash && r.emailSentAt === null)
      r.emailFailedAt = this.now().toISOString();
  }

  async claimEmailRetry(reservationId: number, cancelHash: string): Promise<boolean> {
    const r = this.reservations.find((x) => x.id === reservationId);
    const failed = r?.emailFailedAt !== null || r?.cancelHash === null;
    if (!r || r.status !== 'active' || r.emailSentAt !== null || !failed) return false;
    r.cancelHash = cancelHash;
    r.emailFailedAt = null;
    return true;
  }

  async findByCancelHash(cancelHash: string): Promise<CancelLookup | null> {
    const r = this.reservations.find((x) => x.cancelHash === cancelHash);
    if (!r || !this.event) return null;
    return { reservation: plain(r), event: { ...this.event }, current: true };
  }

  async cancelReservation(reservationId: number, cancelHash: string): Promise<boolean> {
    const r = this.reservations.find((x) => x.id === reservationId);
    if (!r || r.status !== 'active' || r.cancelHash !== cancelHash) return false;
    r.status = 'cancelled';
    r.cancelledAt = this.now().toISOString();
    return true;
  }

  async listReservations(): Promise<ReservationRecord[]> {
    return this.reservations.map(plain);
  }

  async createContribution(input: NewContribution): Promise<ContributionRecord | null> {
    if (this.contributions.some((c) => c.reference === input.reference)) return null;
    const c: ContributionRecord = {
      id: this.nextId++,
      ...input,
      status: 'pending',
      markedSentAt: null,
      reviewedAt: null,
      createdAt: this.now().toISOString(),
    };
    this.contributions.push(c);
    return { ...c };
  }

  async markContributionSent(reference: string): Promise<ContributionRecord | null> {
    const c = this.contributions.find((x) => x.reference === reference);
    if (!c) return null;
    c.markedSentAt ??= this.now().toISOString();
    return { ...c };
  }

  async setContributionStatus(
    id: number,
    status: ContributionStatus,
  ): Promise<ContributionRecord | null> {
    const c = this.contributions.find((x) => x.id === id);
    if (!c) return null;
    c.status = status;
    c.reviewedAt = status === 'pending' ? null : this.now().toISOString();
    return { ...c };
  }

  async listContributions(): Promise<ContributionRecord[]> {
    return [...this.contributions].reverse().map((c) => ({ ...c }));
  }

  async listAnnouncements(): Promise<AnnouncementRecord[]> {
    return [...this.announcements].reverse().map((a) => ({ ...a }));
  }

  async createAnnouncement(fields: AnnouncementFields): Promise<AnnouncementRecord> {
    const a: AnnouncementRecord = {
      ...fields,
      id: this.nextId++,
      status: 'draft',
      publishedAt: null,
      sentCount: 0,
      audience: null,
      recipients: 0,
      createdAt: this.now().toISOString(),
    };
    this.announcements.push(a);
    return { ...a };
  }

  async updateAnnouncement(
    id: number,
    fields: AnnouncementFields,
  ): Promise<AnnouncementRecord | null> {
    const a = this.announcements.find((x) => x.id === id);
    if (!a) return null;
    Object.assign(a, fields);
    return { ...a };
  }

  async deleteDraftAnnouncement(id: number): Promise<boolean> {
    const i = this.announcements.findIndex((x) => x.id === id && x.status === 'draft');
    if (i < 0) return false;
    this.announcements.splice(i, 1);
    return true;
  }

  async announcementById(id: number): Promise<AnnouncementRecord | null> {
    const a = this.announcements.find((x) => x.id === id);
    return a ? { ...a } : null;
  }

  async publishAnnouncement(id: number, scope: AudienceScope): Promise<AnnouncementRecord | null> {
    const a = this.announcements.find((x) => x.id === id);
    if (!a || a.status !== 'draft') return null;
    // Mark it published before the first await, so a second publish running at the same time
    // finds it already taken and queues nothing (as the database's row lock does).
    a.status = 'published';
    const snapshot: AnnouncementRecord = { ...a, emailContent: null };
    a.emailContent = snapshot;
    const people = await this.updatesAudience(scope);
    for (const p of people)
      this.outbox.push({
        id: this.nextId++,
        announcementId: id,
        name: p.name,
        email: p.email,
        unsubToken: randomBytes(24).toString('base64url'),
        status: 'pending',
        attempts: 0,
        claimedAt: 0,
        sentAt: null,
        finishedAt: null,
        error: null,
        claimToken: null,
      });
    Object.assign(a, {
      publishedAt: this.now().toISOString(),
      recipients: people.length,
      audience: scope,
    });
    return { ...a };
  }

  async claimOutbox(limit: number, dailyLimit: number) {
    const now = this.now().getTime();
    // A claim older than 10 minutes that never started sending: nothing went out, so it goes back
    // in the queue (its old token stops working).
    for (const o of this.outbox)
      if (o.status === 'claimed' && now - o.claimedAt > 10 * 60_000)
        Object.assign(o, { status: 'pending', claimToken: null });
    // A send that started more than 10 minutes ago belongs to a run that died, maybe after
    // sending: close it as failed rather than risk sending twice.
    for (const o of this.outbox)
      if (o.status === 'sending' && now - o.claimedAt > 10 * 60_000)
        Object.assign(o, {
          status: 'failed',
          attempts: o.attempts + 1,
          error: 'Sending did not finish',
          finishedAt: now,
        });
    // Anyone who unsubscribed since publishing gets nothing more.
    for (const o of this.outbox)
      if (o.status === 'pending' && this.unsubscribed.has(o.email)) o.status = 'skipped';
    // Emails being sent right now, and failed ones whose attempt ended in the last 24 hours (they
    // may have gone out), count toward today's limit too.
    const day = 86_400_000;
    const sentToday = this.outbox.filter(
      (o) =>
        (o.sentAt !== null && now - o.sentAt < day) ||
        o.status === 'claimed' ||
        o.status === 'sending' ||
        (o.status === 'failed' && now - (o.finishedAt ?? o.claimedAt) < day),
    ).length;
    const n = Math.max(0, Math.min(limit, dailyLimit - sentToday));
    // Fresh emails first; ones being retried wait behind them.
    const claimed = this.outbox
      .filter((o) => o.status === 'pending')
      .sort((x, y) => x.attempts - y.attempts || x.id - y.id)
      .slice(0, n);
    for (const o of claimed)
      Object.assign(o, {
        status: 'claimed',
        claimedAt: now,
        claimToken: randomBytes(12).toString('hex'),
      });
    return claimed.map((o) => ({
      id: o.id,
      announcementId: o.announcementId,
      name: o.name,
      email: o.email,
      unsubToken: o.unsubToken,
      claimToken: o.claimToken ?? '',
    }));
  }

  async beginOutbox(id: number, claimToken: string): Promise<boolean> {
    const o = this.outbox.find((x) => x.id === id);
    if (!o || o.status !== 'claimed' || o.claimToken !== claimToken) return false;
    Object.assign(o, { status: 'sending', claimedAt: this.now().getTime() });
    return true;
  }

  async isUnsubscribed(email: string): Promise<boolean> {
    return this.unsubscribed.has(email);
  }

  async finishOutbox(id: number, outcome: OutboxOutcome, error?: string): Promise<void> {
    const o = this.outbox.find((x) => x.id === id);
    if (!o || (o.status !== 'claimed' && o.status !== 'sending')) return;
    o.error = error ? error.slice(0, 200) : null;
    o.finishedAt = this.now().getTime();
    if (outcome === 'skipped') {
      o.status = 'skipped';
      return;
    }
    if (outcome === 'later') {
      o.status = 'pending';
      return;
    }
    o.attempts++;
    if (outcome === 'sent') {
      Object.assign(o, { status: 'sent', sentAt: this.now().getTime(), error: null });
      const a = this.announcements.find((x) => x.id === o.announcementId);
      if (a) a.sentCount++;
    } else if (outcome === 'retry') o.status = o.attempts >= 3 ? 'failed' : 'pending';
    else o.status = 'failed';
  }

  async resubscribe(token: string): Promise<string | null> {
    const o = this.outbox.find((x) => x.unsubToken === token);
    if (!o) return null;
    this.unsubscribed.delete(o.email);
    return o.email;
  }

  async subscriptionByToken(token: string): Promise<{ email: string; subscribed: boolean } | null> {
    const o = this.outbox.find((x) => x.unsubToken === token);
    return o ? { email: o.email, subscribed: !this.unsubscribed.has(o.email) } : null;
  }

  async unsubscribe(token: string): Promise<string | null> {
    const o = this.outbox.find((x) => x.unsubToken === token);
    if (!o) return null;
    this.unsubscribed.add(o.email);
    for (const x of this.outbox)
      if (x.email === o.email && x.status === 'pending') x.status = 'skipped';
    return o.email;
  }

  async upcomingAnnouncements(todayIso: string, limit: number): Promise<AnnouncementRecord[]> {
    return orderUpcoming(
      this.announcements.filter(
        (a) => a.status === 'published' && (a.endDate ?? a.date) >= todayIso,
      ),
      todayIso,
      limit,
    ).map((a) => ({ ...a }));
  }

  async updatesAudience(scope: AudienceScope = 'all'): Promise<AudienceMember[]> {
    const seen = new Map<string, AudienceMember>();
    if (scope !== 'imported')
      for (const r of this.reservations)
        if (r.updates) seen.set(r.email, { name: r.name, email: r.email, source: 'Booked a seat' });
    if (scope !== 'booked')
      for (const c of this.contacts) if (!seen.has(c.email)) seen.set(c.email, { ...c });
    return [...seen.values()].filter((p) => !this.unsubscribed.has(p.email));
  }

  async importContacts(
    people: { name: string; email: string }[],
    label: string,
  ): Promise<{ added: number; existing: number; unsubscribed: number }> {
    // Imported membership does not depend on bookings: someone who booked is still added, so an
    // announcement sent to imported people only reaches everyone in the sheet.
    const onList = new Set(this.contacts.map((c) => c.email));
    const result = { added: 0, existing: 0, unsubscribed: 0 };
    for (const p of people) {
      if (this.unsubscribed.has(p.email)) result.unsubscribed++;
      else if (onList.has(p.email)) result.existing++;
      else {
        this.contacts.push({ name: p.name, email: p.email, source: label });
        onList.add(p.email);
        result.added++;
      }
    }
    return result;
  }

  async ping(): Promise<void> {}
}

const pick = (r: ReservationRecord) => ({
  id: r.id,
  seat: r.seat,
  code: r.code,
  emailSentAt: r.emailSentAt,
});
