export interface GatheringEvent {
  title: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  time: string;
  venue: string;
}

export interface Reservation {
  /** 1-based seat number for the current gathering. */
  seat: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  updates: boolean;
  createdAt: string;
}

export interface ReservationRequest {
  name: string;
  email: string;
  phone: string;
  updates: boolean;
}

export type ReserveResult =
  { ok: true; reservation: Reservation; existing: boolean } | { ok: false; reason: 'full' };

/**
 * Persistence boundary. The site currently ships with a browser-local
 * implementation; a server-backed implementation can replace it without
 * touching the views.
 */
export interface Store {
  getEvent(): GatheringEvent;
  saveEvent(event: GatheringEvent): void;
  listReservations(): Reservation[];
  /** Seats taken, including any demo baseline. */
  reservedCount(): number;
  reserve(request: ReservationRequest): ReserveResult;
}
