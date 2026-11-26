/** Shapes returned by the `/api` endpoints (see `server/api.ts`). */

export interface GatheringEvent {
  title: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Start time in Lagos, "HH:MM"; older gatherings may hold free text. See `displayTime`. */
  time: string;
  venue: string;
  capacity: number;
}

export type Currency = 'NGN' | 'USD';

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  /** For international dollar transfers. */
  swiftCode?: string;
}

/** One account per currency; null when that account is not set up. */
export type Banks = Record<Currency, BankDetails | null>;

/** Another BTN event, as listed on the site. */
export interface UpcomingEvent {
  id: number;
  title: string;
  date: string;
  endDate: string | null;
  time: string | null;
  theme: string | null;
  themeTba: boolean;
  venue: string;
  venueTba: boolean;
  summary: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
}

/** An announcement as the organisers edit it. */
export interface Announcement extends Omit<UpcomingEvent, 'id'> {
  id: number;
  subject: string;
  message: string;
  status: 'draft' | 'published';
  publishedAt: string | null;
  /** Emails the mail service accepted (inbox delivery is not confirmed). */
  sentCount: number;
  /** Emails closed without a confirmed delivery: failed (some may still have arrived, such as
   *  after a timeout), or skipped because the person unsubscribed. */
  unsentCount: number;
  recipients: number;
  audience: AudienceScope | null;
  createdAt: string;
}

/** Who an announcement goes to: people who booked (and asked for updates), imported, or both. */
export type AudienceScope = 'all' | 'booked' | 'imported';

export interface AudienceMember {
  name: string;
  email: string;
  /** "Booked a seat", or the label of the import they came from. */
  source: string;
}

export interface AnnouncementsInfo {
  announcements: Announcement[];
  audience: number;
  counts: Record<AudienceScope, number>;
  /** Default address for "Send a test to me". */
  testTo: string;
  dailyLimit: number;
  /** Which email service is on, or null when email is off. */
  email: string | null;
}

export interface ImportOutcome {
  added: number;
  existing: number;
  unsubscribed: number;
  invalid: number;
}

export type AnnouncementForm = Omit<
  Announcement,
  | 'id'
  | 'status'
  | 'publishedAt'
  | 'sentCount'
  | 'unsentCount'
  | 'recipients'
  | 'audience'
  | 'createdAt'
>;

export interface PublicInfo {
  event: GatheringEvent | null;
  reserved: number;
  banks: Banks;
  /** Other BTN events coming up, soonest first. */
  upcoming: UpcomingEvent[];
}

/** A reservation made during this visit. */
export interface Reservation {
  seat: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  /** Private token for the "Cancel my seat" link. */
  cancelToken?: string;
}

/** What a cancel link shows: the seat, and whether it can still be cancelled. */
export interface CancelInfo {
  status: 'active' | 'cancelled' | 'ended';
  seat: number;
  code: string;
  name: string;
  event: Omit<GatheringEvent, 'capacity'>;
  /** Seats held after a cancellation, so the seat count can update. */
  reserved?: number;
}

export type ReserveResponse =
  | {
      status: 'created';
      reservation: Reservation;
      reserved: number;
      capacity: number;
      emailQueued: boolean;
    }
  | { status: 'existing'; reserved: number; capacity: number; emailQueued: boolean }
  | { status: 'full'; reserved: number; capacity: number };

export interface Contribution {
  id: number;
  reference: string;
  name: string;
  email: string;
  currency: Currency;
  amount: number;
  status: 'pending' | 'confirmed' | 'rejected';
  markedSentAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminReservation {
  seat: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  updates: boolean;
  emailSent: boolean;
  createdAt: string;
  status: 'active' | 'cancelled';
  cancelledAt: string | null;
}

export interface AdminData {
  event: GatheringEvent | null;
  reserved: number;
  reservations: AdminReservation[];
  contributions: Contribution[];
  totals: {
    confirmed: Record<Currency, number>;
    confirmedCount: number;
    supporters: number;
    pending: Record<Currency, number>;
    pendingCount: number;
  };
  byDay: { date: string; count: number }[];
  /** Which email service is active, or null when email is off. */
  email: string | null;
  banks: Banks;
}
