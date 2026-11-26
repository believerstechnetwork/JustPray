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

/** Storage used by the API. `SupabaseDb` in production, `MemoryDb` in tests and local dev. */
export interface Db {
  currentEvent(): Promise<EventDetails | null>;
  /** Refuses (and changes nothing) when capacity is below the seats already reserved. */
  updateEvent(event: EventDetails): Promise<UpdateEventOutcome>;
  /** Seats held now: cancelled reservations do not count. */
  reservedCount(): Promise<number>;
  /** A cancelled reservation for the same email is brought back (status 'created'). */
  reserve(input: NewReservation): Promise<ReserveOutcome>;
  markEmailSent(reservationId: number): Promise<void>;
  /** Replace the cancel token, e.g. when a confirmation email is sent again. */
  setCancelHash(reservationId: number, cancelHash: string): Promise<void>;
  findByCancelHash(cancelHash: string): Promise<CancelLookup | null>;
  /** True when this call cancelled it; false when it was already cancelled or is unknown. */
  cancelReservation(reservationId: number): Promise<boolean>;
  /** Every reservation for the current gathering, cancelled ones included. */
  listReservations(): Promise<ReservationRecord[]>;
  /** Returns null when the reference is already taken. */
  createContribution(input: NewContribution): Promise<ContributionRecord | null>;
  markContributionSent(reference: string): Promise<ContributionRecord | null>;
  setContributionStatus(id: number, status: ContributionStatus): Promise<ContributionRecord | null>;
  listContributions(): Promise<ContributionRecord[]>;
  ping(): Promise<void>;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  /** Name used in logs, e.g. "gmail". */
  readonly kind: string;
  send(email: Email): Promise<void>;
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
