import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore } from '../../src/data/local-store';
import type { GatheringEvent } from '../../src/data/types';

const defaultEvent: GatheringEvent = { title: 'T', date: '2027-01-30', time: '4pm', venue: 'V' };

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

const person = (n: number) => ({
  name: `Person ${n}`,
  email: `p${n}@example.com`,
  phone: '+234 801 234 5678',
  updates: false,
});

describe('LocalStore', () => {
  let storage: MemoryStorage;
  const make = (capacity = 5, baseline = 2, s: MemoryStorage | null = storage) =>
    new LocalStore({ capacity, baseline, defaultEvent, storage: s });

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('numbers seats after the demo baseline and builds the code', () => {
    const r = make().reserve(person(1));
    expect(r.ok && r.reservation.seat).toBe(3);
    expect(r.ok && r.reservation.code).toBe('JP-0003');
  });

  it('is idempotent per email (case-insensitive)', () => {
    const store = make();
    store.reserve(person(1));
    const again = store.reserve({ ...person(1), email: 'P1@Example.com' });
    expect(again.ok && again.existing).toBe(true);
    expect(store.reservedCount()).toBe(3);
  });

  it('refuses when full', () => {
    const store = make(4, 2);
    expect(store.reserve(person(1)).ok).toBe(true);
    expect(store.reserve(person(2)).ok).toBe(true);
    expect(store.reserve(person(3))).toEqual({ ok: false, reason: 'full' });
    expect(store.reservedCount()).toBe(4);
  });

  it('persists across instances', () => {
    make().reserve(person(1));
    expect(make().listReservations()).toHaveLength(1);
  });

  it('merges saved event over defaults', () => {
    const store = make();
    expect(store.getEvent()).toEqual(defaultEvent);
    store.saveEvent({ ...defaultEvent, venue: 'New venue' });
    expect(make().getEvent().venue).toBe('New venue');
  });

  it('ignores corrupt stored data', () => {
    storage.setItem('jp:reservations', '{not json');
    expect(make().listReservations()).toEqual([]);
  });

  it('keeps working when storage is unavailable or throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = new LocalStore({ capacity: 5, baseline: 0, defaultEvent, storage: broken });
    expect(store.reserve(person(1)).ok).toBe(true);
    expect(store.listReservations()).toHaveLength(1);
    expect(
      new LocalStore({ capacity: 5, baseline: 0, defaultEvent, storage: null }).getEvent(),
    ).toEqual(defaultEvent);
  });
});
