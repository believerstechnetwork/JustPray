import { reservationCode } from '../lib/format';
import type {
  GatheringEvent,
  Reservation,
  ReservationRequest,
  ReserveResult,
  Store,
} from './types';

const EVENT_KEY = 'jp:event';
const RESERVATIONS_KEY = 'jp:reservations';

export interface LocalStoreOptions {
  capacity: number;
  /** Seats counted as taken before any local reservation (demo data). */
  baseline: number;
  defaultEvent: GatheringEvent;
  /** Defaults to window.localStorage; may be unavailable (private mode). */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => Date;
}

/** Store that keeps data in the visitor's browser. Every storage access is
 *  guarded, so the site still works when storage is blocked. */
export class LocalStore implements Store {
  private readonly opts: LocalStoreOptions;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private memory = new Map<string, string>();

  constructor(opts: LocalStoreOptions) {
    this.opts = opts;
    this.storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
  }

  getEvent(): GatheringEvent {
    const saved = this.read<Partial<GatheringEvent>>(EVENT_KEY);
    return { ...this.opts.defaultEvent, ...(saved ?? {}) };
  }

  saveEvent(event: GatheringEvent): void {
    this.write(EVENT_KEY, event);
  }

  listReservations(): Reservation[] {
    const list = this.read<Reservation[]>(RESERVATIONS_KEY);
    return Array.isArray(list) ? list : [];
  }

  reservedCount(): number {
    return Math.min(this.opts.capacity, this.opts.baseline + this.listReservations().length);
  }

  reserve(request: ReservationRequest): ReserveResult {
    const list = this.listReservations();
    const email = request.email.trim().toLowerCase();
    const existing = list.find((r) => r.email === email);
    if (existing) return { ok: true, reservation: existing, existing: true };
    if (this.reservedCount() >= this.opts.capacity) return { ok: false, reason: 'full' };

    const seat = this.opts.baseline + list.length + 1;
    const reservation: Reservation = {
      seat,
      code: reservationCode(seat),
      name: request.name.trim(),
      email,
      phone: request.phone.trim(),
      updates: request.updates,
      createdAt: (this.opts.now ?? (() => new Date()))().toISOString(),
    };
    this.write(RESERVATIONS_KEY, [...list, reservation]);
    return { ok: true, reservation, existing: false };
  }

  private read<T>(key: string): T | null {
    let raw: string | null;
    try {
      raw = this.storage ? this.storage.getItem(key) : null;
    } catch {
      raw = null;
    }
    raw ??= this.memory.get(key) ?? null;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    this.memory.set(key, raw);
    try {
      this.storage?.setItem(key, raw);
    } catch {
      /* storage full or blocked: the in-memory copy keeps this visit working */
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
