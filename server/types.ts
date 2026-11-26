/** Data types shared by the API handler and its storage implementations. */

export interface EventDetails {
  title: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Start time in Lagos, "HH:MM" (24-hour). Gatherings saved before the time picker may hold
   *  free text such as "4:00 PM WAT"; `parseTime` reads both. */
  time: string;
  venue: string;
  capacity: number;
}

export type UpdateEventOutcome =
  { ok: true; event: EventDetails } | { ok: false; reserved: number };

export type ReservationStatus = 'active' | 'cancelled';

export interface ReservationRecord {
  id: number;
  seat: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  updates: boolean;
  emailSentAt: string | null;
  createdAt: string;
  status: ReservationStatus;
  cancelledAt: string | null;
}

export interface NewReservation {
  name: string;
  email: string;
  phone: string;
  updates: boolean;
  /** SHA-256 of the private cancel token; the token itself is never stored. */
  cancelHash: string;
}

/** A reservation found by its cancel token, with the gathering it belongs to. */
export interface CancelLookup {
  reservation: ReservationRecord;
  event: EventDetails;
  /** False when the organisers have since moved on to another gathering. */
  current: boolean;
}

export interface SeatHeld {
  id: number;
  seat: number;
  code: string;
  emailSentAt: string | null;
  reserved: number;
}

export type ReserveOutcome =
  | ({ status: 'created' } & SeatHeld)
  | ({ status: 'existing' } & SeatHeld)
  | { status: 'full'; reserved: number }
  | { status: 'no_event'; reserved: number };

export type Currency = 'NGN' | 'USD';

export type ContributionStatus = 'pending' | 'confirmed' | 'rejected';
export const CONTRIBUTION_STATUSES: readonly ContributionStatus[] = [
  'pending',
  'confirmed',
  'rejected',
];

export interface ContributionRecord {
  id: number;
  reference: string;
  name: string;
  email: string;
  currency: Currency;
  amount: number;
  status: ContributionStatus;
  /** When the giver pressed "I've sent it". */
  markedSentAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface NewContribution {
  reference: string;
  name: string;
  email: string;
  currency: Currency;
  amount: number;
}

/** Another BTN event (not a Just Pray gathering), announced by email and listed on the site. */
export interface AnnouncementFields {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  endDate: string | null;
  /** "HH:MM" in Lagos, or null. */
  time: string | null;
  /** The event's theme, e.g. "Building with purpose"; null when there is none (yet). */
  theme: string | null;
  /** The theme is still to be announced. */
  themeTba: boolean;
  /** A place, or "Online". With `venueTba`, an optional city such as "Lagos". */
  venue: string;
  /** The venue is still to be announced. */
  venueTba: boolean;
  summary: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  subject: string;
  message: string;
}

export interface AnnouncementRecord extends AnnouncementFields {
  id: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
  /** Emails delivered so far. */
  sentCount: number;
  /** Emails closed without delivery: failed for good, or skipped because the person
   *  unsubscribed. Sending is finished once sentCount + unsentCount reaches recipients. */
  unsentCount: number;
  /** Who it was sent to, once published. */
  audience: AudienceScope | null;
  /** People it was sent to when published. */
  recipients: number;
  createdAt: string;
  /** The email exactly as published. Later batches send this, so edits to the published
   *  event (which change the home page) never change what the rest of the list receives. */
  emailContent?: AnnouncementFields | null;
}

/** Storage used by the API. `SupabaseDb` in production, `MemoryDb` in tests and local dev. */
export interface Db {
  currentEvent(): Promise<EventDetails | null>;
  /** The id of the current gathering's record, which stays the same when its details are edited. */
  currentEventId(): Promise<number | null>;
  /** A gathering by its record id, current or not, with its latest details. */
  eventById(id: number): Promise<EventDetails | null>;
  /** Refuses (and changes nothing) when capacity is below the seats already reserved. */
  updateEvent(event: EventDetails): Promise<UpdateEventOutcome>;
  /** Seats held now: cancelled reservations do not count. */
  reservedCount(): Promise<number>;
  /** A cancelled reservation for the same email is brought back (status 'created'). */
  reserve(input: NewReservation): Promise<ReserveOutcome>;
  /** Record that the confirmation carrying this cancel token was delivered. Does nothing when
   *  the booking has since moved on to another token (cancelled and booked again). */
  markEmailSent(reservationId: number, cancelHash: string): Promise<void>;
  /** Record that the confirmation carrying this cancel token could not be sent. */
  markEmailFailed(reservationId: number, cancelHash: string): Promise<void>;
  /** Claim a re-send of a confirmation that failed, giving it a new cancel token. True for the
   *  one caller that claims it; false while an earlier email may still be on its way, once it
   *  was delivered, or when another request claimed it first. */
  claimEmailRetry(reservationId: number, cancelHash: string): Promise<boolean>;
  findByCancelHash(cancelHash: string): Promise<CancelLookup | null>;
  /** Cancel the booking only if it is active and still holds this cancel token. True when this
   *  call cancelled it. */
  cancelReservation(reservationId: number, cancelHash: string): Promise<boolean>;
  /** Every reservation for the current gathering, cancelled ones included. */
  listReservations(): Promise<ReservationRecord[]>;
  /** Returns null when the reference is already taken. */
  createContribution(input: NewContribution): Promise<ContributionRecord | null>;
  markContributionSent(reference: string): Promise<ContributionRecord | null>;
  setContributionStatus(id: number, status: ContributionStatus): Promise<ContributionRecord | null>;
  listContributions(): Promise<ContributionRecord[]>;
  /** Newest first. */
  listAnnouncements(): Promise<AnnouncementRecord[]>;
  createAnnouncement(fields: AnnouncementFields): Promise<AnnouncementRecord>;
  updateAnnouncement(id: number, fields: AnnouncementFields): Promise<AnnouncementRecord | null>;
  deleteDraftAnnouncement(id: number): Promise<boolean>;
  announcementById(id: number): Promise<AnnouncementRecord | null>;
  /** Draft to published, once, and one outbox email queued per person in `updatesAudience(scope)`,
   *  in the same step. Null when unknown or already published. */
  publishAnnouncement(id: number, scope: AudienceScope): Promise<AnnouncementRecord | null>;
  /** Claim up to `limit` queued emails, never more than `dailyLimit` sent in the last 24 hours.
   *  After 10 minutes, a claim that never started sending goes back in the queue; a send that
   *  started but never finished is closed as failed, never sent again, since it may have gone
   *  out. */
  claimOutbox(limit: number, dailyLimit: number): Promise<OutboxItem[]>;
  /** Switch a claimed email to sending, just before it goes out. False when this run no longer
   *  holds the claim (it stalled and the claim was given back or taken): then it must not send. */
  beginOutbox(id: number, claimToken: string): Promise<boolean>;
  /** Record what happened to one claimed email, by the run holding its claim token (a run
   *  whose claim has expired changes nothing): `sent`; `retry` (nothing went out: back in the
   *  queue, failed after 3 attempts in all); `failed` (closed, never retried, because it may
   *  have gone out or can never go); `skipped` (closed unsent: the person unsubscribed); or
   *  `later` (not sent because the mail service's quota is used up: back in the queue without
   *  using an attempt). */
  finishOutbox(
    id: number,
    claimToken: string,
    outcome: OutboxOutcome,
    error?: string,
  ): Promise<void>;
  isUnsubscribed(email: string): Promise<boolean>;
  /** Unsubscribe the person behind an unsubscribe link. Returns their email, or null. */
  unsubscribe(token: string): Promise<string | null>;
  /** Undo an unsubscribe from the same link. Returns their email, or null. */
  resubscribe(token: string): Promise<string | null>;
  /** Who an unsubscribe link belongs to, and whether they still get announcements. */
  subscriptionByToken(token: string): Promise<{ email: string; subscribed: boolean } | null>;
  /** Published events that have not ended by this Lagos date, soonest first. */
  upcomingAnnouncements(todayIso: string, limit: number): Promise<AnnouncementRecord[]>;
  /** Everyone who gets announcements, one per email: people who booked and asked to hear about
   *  future events ('booked'), imported contacts ('imported'), or both ('all'), less anyone who
   *  unsubscribed. Someone on both lists is listed once, as "Booked a seat". */
  updatesAudience(scope?: AudienceScope): Promise<AudienceMember[]>;
  /** Add imported people to the list. Emails are already checked and lower-case. */
  importContacts(people: { name: string; email: string }[], label: string): Promise<ImportResult>;
  ping(): Promise<void>;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe on announcements. */
  headers?: Record<string, string>;
  /** The same key on a repeat makes Resend drop it instead of sending the email twice. */
  idempotencyKey?: string;
}

/** Who an announcement goes to: people who booked and asked for updates, imported people, or both. */
export type AudienceScope = 'all' | 'booked' | 'imported';

/** What happened to one queued announcement email. See Db.finishOutbox. */
export type OutboxOutcome = 'sent' | 'retry' | 'failed' | 'skipped' | 'later';
export const AUDIENCE_SCOPES: readonly AudienceScope[] = ['all', 'booked', 'imported'];

/** Someone who gets announcements, and how they joined the list. */
export interface AudienceMember {
  name: string;
  email: string;
  /** "Booked a seat", or the label given to an Excel import. */
  source: string;
}

export interface ImportResult {
  /** Newly added to the list. */
  added: number;
  /** Already on the list (imported before, or booked and asked for updates). */
  existing: number;
  /** Unsubscribed earlier, so not added back. */
  unsubscribed: number;
}

/** One announcement email waiting in the outbox, claimed for sending. */
export interface OutboxItem {
  id: number;
  announcementId: number;
  name: string;
  email: string;
  /** Private token for this person's unsubscribe link. */
  unsubToken: string;
  /** Proves this run holds the claim; needed to start sending. */
  claimToken: string;
}

export interface Mailer {
  /** Name used in logs, e.g. "gmail". */
  readonly kind: string;
  send(email: Email): Promise<void>;
  /** True when a failed send certainly delivered nothing (or the service drops repeats), so
   *  sending it again cannot reach the person twice. Without it, a failed send is never retried. */
  canRetry?(error: unknown): boolean;
  /** True when the service refused because its sending quota is used up for now. Those emails
   *  wait for the quota to reset instead of using up their attempts. */
  isQuota?(error: unknown): boolean;
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** For international dollar transfers. */
  swiftCode?: string;
}

/** One account per currency; null when that account is not set up. */
export type Banks = Record<Currency, BankDetails | null>;
