import { describe, expect, it } from 'vitest';
import { SupabaseDb } from '../../server/supabase-db';

interface Seen {
  method: string;
  path: string;
  query: string;
  body: unknown;
  headers: Headers;
}

/** Fake Supabase Data API: records requests and answers from a list of responses. */
function fakeSupabase(responses: Array<{ status?: number; body: unknown }>) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    seen.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: decodeURIComponent(url.search),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
    });
    const next = responses.shift() ?? { body: [] };
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { db: new SupabaseDb('https://proj.supabase.co', 'sb_secret_test', fetchImpl), seen };
}

describe('SupabaseDb', () => {
  it('calls reserve_seat with the secret key and maps the result', async () => {
    const { db, seen } = fakeSupabase([
      {
        body: [
          {
            status: 'created',
            reservation_id: 7,
            seat: 3,
            code: 'JP-0003',
            email_sent_at: null,
            reserved: 3,
          },
        ],
      },
    ]);
    const out = await db.reserve({ name: 'Ada', email: 'a@b.co', phone: '+234', updates: true });
    expect(out).toEqual({
      status: 'created',
      id: 7,
      seat: 3,
      code: 'JP-0003',
      emailSentAt: null,
      reserved: 3,
    });
    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: '/rest/v1/rpc/reserve_seat',
      body: { p_name: 'Ada', p_email: 'a@b.co', p_phone: '+234', p_updates: true },
    });
    expect(seen[0]?.headers.get('apikey')).toBe('sb_secret_test');
  });

  it('maps full and unknown statuses', async () => {
    const { db } = fakeSupabase([
      { body: [{ status: 'full', reserved: 120 }] },
      { body: [{ status: '??' }] },
    ]);
    expect(await db.reserve({ name: 'A', email: 'a@b.co', phone: '1', updates: false })).toEqual({
      status: 'full',
      reserved: 120,
    });
    await expect(
      db.reserve({ name: 'A', email: 'a@b.co', phone: '1', updates: false }),
    ).rejects.toThrow(/unexpected reserve status/);
  });

  it('reads the current event', async () => {
    const { db, seen } = fakeSupabase([
      {
        body: [
          {
            id: 1,
            title: 'T',
            date: '2027-01-30',
            time: '4pm',
            venue: 'V',
            capacity: 120,
            is_current: true,
          },
        ],
      },
    ]);
    expect(await db.currentEvent()).toEqual({
      title: 'T',
      date: '2027-01-30',
      time: '4pm',
      venue: 'V',
      capacity: 120,
    });
    expect(seen[0]?.path).toBe('/rest/v1/events');
    expect(seen[0]?.query).toContain('is_current=eq.true');
  });

  it('returns null for a duplicate contribution reference', async () => {
    const { db } = fakeSupabase([
      { status: 409, body: { code: '23505', message: 'duplicate key' } },
    ]);
    expect(
      await db.createContribution({
        reference: 'JP-AAAAA',
        name: 'A',
        email: 'a@b.co',
        currency: 'NGN',
        amount: 100,
      }),
    ).toBeNull();
  });

  it('turns database errors into exceptions without the key', async () => {
    const { db } = fakeSupabase([{ status: 500, body: { code: 'XX000', message: 'boom' } }]);
    const err = await db.listContributions().catch((e: Error) => e);
    expect(String(err)).toContain('Database error: boom');
    expect(String(err)).not.toContain('sb_secret_test');
  });

  it('changes the event through the locking update_current_event function', async () => {
    const ev = { title: 'T', date: '2027-02-27', time: '5pm', venue: 'V', capacity: 50 };
    const { db, seen } = fakeSupabase([
      { body: [{ status: 'ok', reserved: 3 }] },
      { body: [{ id: 1, ...ev, is_current: true }] },
      { body: [{ status: 'too_low', reserved: 60 }] },
    ]);
    expect(await db.updateEvent(ev)).toEqual({ ok: true, event: ev });
    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: '/rest/v1/rpc/update_current_event',
      body: { p_title: 'T', p_date: '2027-02-27', p_time: '5pm', p_venue: 'V', p_capacity: 50 },
    });
    expect(await db.updateEvent(ev)).toEqual({ ok: false, reserved: 60 });
  });

  it('reads every page of a long list instead of stopping at the response limit', async () => {
    const row = (id: number) => ({
      id,
      reference: `JP-${id}`,
      name: 'A',
      email: `a${id}@b.co`,
      currency: 'NGN',
      amount: 100,
      status: 'pending',
      marked_sent_at: null,
      reviewed_at: null,
      created_at: '2027-01-01T00:00:00Z',
    });
    const { db, seen } = fakeSupabase([
      { body: Array.from({ length: 1000 }, (_, i) => row(i + 1)) },
      { body: Array.from({ length: 5 }, (_, i) => row(i + 1001)) },
    ]);
    expect(await db.listContributions()).toHaveLength(1005);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.query).toContain('offset=0&limit=1000');
    expect(seen[1]?.query).toContain('offset=1000&limit=1000');
  });

  it('maps contribution rows', async () => {
    const row = {
      id: 2,
      reference: 'JP-ABCDE',
      name: 'Ada',
      email: 'a@b.co',
      currency: 'USD',
      amount: 2500,
      status: 'confirmed',
      marked_sent_at: '2027-01-01T10:00:00Z',
      reviewed_at: null,
      created_at: '2027-01-01T09:00:00Z',
    };
    const { db, seen } = fakeSupabase([{ body: [row] }]);
    expect(await db.setContributionStatus(2, 'confirmed')).toEqual({
      id: 2,
      reference: 'JP-ABCDE',
      name: 'Ada',
      email: 'a@b.co',
      currency: 'USD',
      amount: 2500,
      status: 'confirmed',
      markedSentAt: '2027-01-01T10:00:00Z',
      reviewedAt: null,
      createdAt: '2027-01-01T09:00:00Z',
    });
    expect(seen[0]).toMatchObject({ method: 'PATCH', path: '/rest/v1/contributions' });
    expect(seen[0]?.query).toContain('id=eq.2');
  });
});
