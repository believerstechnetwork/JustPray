import type {
  AnnouncementFields,
  AnnouncementRecord,
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

  async publishAnnouncement(id: number, recipients: number): Promise<AnnouncementRecord | null> {
    const a = this.announcements.find((x) => x.id === id);
    if (!a || a.status !== 'draft') return null;
    Object.assign(a, { status: 'published', publishedAt: this.now().toISOString(), recipients });
    return { ...a };
  }

  async upcomingAnnouncements(todayIso: string, limit: number): Promise<AnnouncementRecord[]> {
    return this.announcements
      .filter((a) => a.status === 'published' && (a.endDate ?? a.date) >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit)
      .map((a) => ({ ...a }));
  }

  async updatesAudience(): Promise<{ name: string; email: string }[]> {
    const seen = new Map<string, string>();
    for (const r of this.reservations)
      if (r.updates && !this.unsubscribed.has(r.email)) seen.set(r.email, r.name);
    return [...seen].map(([email, name]) => ({ name, email }));
  }

  async ping(): Promise<void> {}
}

const pick = (r: ReservationRecord) => ({
  id: r.id,
  seat: r.seat,
  code: r.code,
  emailSentAt: r.emailSentAt,
});
