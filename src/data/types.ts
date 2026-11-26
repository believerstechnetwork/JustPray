/** Shapes returned by the `/api` endpoints (see `server/api.ts`). */

export interface GatheringEvent {
  title: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
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

export interface PublicInfo {
  event: GatheringEvent | null;
  reserved: number;
  banks: Banks;
}

/** A reservation made during this visit. */
export interface Reservation {
  seat: number;
  code: string;
  name: string;
  email: string;
  phone: string;
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
