import type {
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
export class MemoryDb implements Db {
  event: EventDetails | null;
  reservations: ReservationRecord[] = [];
  contributions: ContributionRecord[] = [];
  private nextId = 1;
  private readonly now: () => Date;

  constructor(event: EventDetails | null, now: () => Date = () => new Date()) {
    this.event = event ? { ...event } : null;
    this.now = now;
  }

  async currentEvent(): Promise<EventDetails | null> {
    return this.event ? { ...this.event } : null;
  }

  async updateEvent(event: EventDetails): Promise<UpdateEventOutcome> {
    if (event.capacity < this.reservations.length)
      return { ok: false, reserved: this.reservations.length };
    this.event = { ...event };
    return { ok: true, event: { ...event } };
  }

  async reservedCount(): Promise<number> {
    return this.reservations.length;
  }

  async reserve(input: NewReservation): Promise<ReserveOutcome> {
    const taken = this.reservations.length;
    if (!this.event) return { status: 'no_event', reserved: 0 };
    const email = input.email.trim().toLowerCase();
    const existing = this.reservations.find((r) => r.email === email);
    if (existing) return { status: 'existing', ...pick(existing), reserved: taken };
    if (taken >= this.event.capacity) return { status: 'full', reserved: taken };
    const seat = Math.max(0, ...this.reservations.map((r) => r.seat)) + 1;
    const r: ReservationRecord = {
      id: this.nextId++,
      seat,
      code: `JP-${String(seat).padStart(4, '0')}`,
      name: input.name.trim(),
      email,
      phone: input.phone.trim(),
      updates: input.updates,
      emailSentAt: null,
      createdAt: this.now().toISOString(),
    };
    this.reservations.push(r);
    return { status: 'created', ...pick(r), reserved: taken + 1 };
  }

  async markEmailSent(reservationId: number): Promise<void> {
    const r = this.reservations.find((x) => x.id === reservationId);
    if (r) r.emailSentAt = this.now().toISOString();
  }

  async listReservations(): Promise<ReservationRecord[]> {
    return this.reservations.map((r) => ({ ...r }));
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

  async ping(): Promise<void> {}
}

const pick = (r: ReservationRecord) => ({
  id: r.id,
  seat: r.seat,
  code: r.code,
  emailSentAt: r.emailSentAt,
});
