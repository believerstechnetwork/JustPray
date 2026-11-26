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
    const out = await db.reserve({
      name: 'Ada',
      email: 'a@b.co',
      phone: '+234',
      updates: true,
      cancelHash: 'h1',
    });
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
      body: {
        p_name: 'Ada',
        p_email: 'a@b.co',
        p_phone: '+234',
        p_updates: true,
        p_cancel_hash: 'h1',
      },
    });
    expect(seen[0]?.headers.get('apikey')).toBe('sb_secret_test');
  });

  it('maps full and unknown statuses', async () => {
    const { db } = fakeSupabase([
      { body: [{ status: 'full', reserved: 120 }] },
      { body: [{ status: '??' }] },
    ]);
    expect(
      await db.reserve({ name: 'A', email: 'a@b.co', phone: '1', updates: false, cancelHash: 'h' }),
    ).toEqual({
      status: 'full',
      reserved: 120,
    });
    await expect(
      db.reserve({ name: 'A', email: 'a@b.co', phone: '1', updates: false, cancelHash: 'h' }),
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
      { body: [] },
    ]);
    const list = await db.listContributions();
    expect(list).toHaveLength(1005);
    // Newest first, no repeats.
    expect(list[0]?.id).toBe(1005);
    expect(new Set(list.map((c) => c.id)).size).toBe(1005);
    // Keyset pages: each page starts after the last id of the previous one.
    expect(seen).toHaveLength(3);
    expect(seen[0]?.query).toContain('id=gt.0');
    expect(seen[1]?.query).toContain('id=gt.1000');
    expect(seen[1]?.query).toContain('limit=1000');
    expect(seen[1]?.query).not.toContain('offset');
    expect(seen[2]?.query).toContain('id=gt.1005');
  });

  it('orders the ledger by creation time, then id, newest first', async () => {
    const at = (id: number, created_at: string) => ({
      id,
      reference: `JP-${id}`,
      name: 'A',
      email: 'a@b.co',
      currency: 'NGN',
      amount: 100,
      status: 'pending',
      created_at,
    });
    const { db } = fakeSupabase([
      // Id 2 was allocated first but committed later than id 3.
      {
        body: [
          at(1, '2027-01-01T10:00:00.000Z'),
          at(2, '2027-01-01T10:00:00.900Z'),
          at(3, '2027-01-01T10:00:00.500Z'),
          at(4, '2027-01-01T10:00:00.500Z'),
        ],
      },
      { body: [] },
    ]);
    expect((await db.listContributions()).map((c) => c.id)).toEqual([2, 4, 3, 1]);
  });

  it('orders by time even when fractional seconds have different lengths', async () => {
    const at = (id: number, created_at: string) => ({
      id,
      reference: `JP-${id}`,
      name: 'A',
      email: 'a@b.co',
      currency: 'NGN',
      amount: 100,
      status: 'pending',
      created_at,
    });
    const { db } = fakeSupabase([
      // As PostgREST returns them: trailing zeros dropped. As strings, ".45" sorts after ".5".
      {
        body: [
          at(1, '2027-01-01T10:00:00.5+00:00'),
          at(2, '2027-01-01T10:00:00.45+00:00'),
          at(3, '2027-01-01T10:00:01+00:00'),
        ],
      },
      { body: [] },
    ]);
    expect((await db.listContributions()).map((c) => c.id)).toEqual([3, 1, 2]);
  });

  it('keeps reading when the server caps pages below 1,000 rows', async () => {
    const row = (id: number) => ({
      id,
      reference: `JP-${id}`,
      name: 'A',
      email: 'a@b.co',
      currency: 'NGN',
      amount: 100,
      status: 'pending',
      created_at: '2027-01-01T00:00:00Z',
    });
    const { db } = fakeSupabase([{ body: [row(1), row(2)] }, { body: [row(3)] }, { body: [] }]);
    expect((await db.listContributions()).map((c) => c.id)).toEqual([3, 2, 1]);
  });

  it('counts only held seats', async () => {
    const { db, seen } = fakeSupabase([{ body: [{ id: 4, is_current: true }] }, { body: [] }]);
    await db.reservedCount();
    expect(seen[1]?.query).toContain('event_id=eq.4');
    expect(seen[1]?.query).toContain('status=eq.active');
  });

  it('finds a reservation by its cancel hash without reading the hash back', async () => {
    const reservation = {
      id: 9,
      event_id: 4,
      seat: 2,
      code: 'JP-0002',
      name: 'Ada',
      email: 'a@b.co',
      phone: '+234',
      updates: false,
      email_sent_at: null,
      created_at: '2027-01-01T00:00:00Z',
      status: 'active',
      cancelled_at: null,
    };
    const event = {
      id: 4,
      title: 'T',
      date: '2027-01-30',
      time: '16:00',
      venue: 'V',
      capacity: 9,
      is_current: false,
    };
    const { db, seen } = fakeSupabase([{ body: [reservation] }, { body: [event] }]);
    const found = await db.findByCancelHash('abc');
    expect(found).toMatchObject({
      reservation: { id: 9, seat: 2, status: 'active', cancelledAt: null },
      event: { title: 'T', time: '16:00' },
      current: false,
    });
    expect(seen[0]?.query).toContain('cancel_hash=eq.abc');
    expect(seen[0]?.query).not.toMatch(/select=[^&]*cancel_hash/);
    expect(seen[1]?.query).toContain('id=eq.4');
  });

  it('cancels only an active reservation that still holds the checked token, once', async () => {
    const { db, seen } = fakeSupabase([{ body: [{ id: 9 }] }, { body: [] }]);
    expect(await db.cancelReservation(9, 'h1')).toBe(true);
    expect(await db.cancelReservation(9, 'h1')).toBe(false);
    expect(seen[0]).toMatchObject({ method: 'PATCH', path: '/rest/v1/reservations' });
    expect(seen[0]?.query).toContain('status=eq.active');
    expect(seen[0]?.query).toContain('cancel_hash=eq.h1');
    expect(seen[0]?.body).toMatchObject({ status: 'cancelled' });
  });

  it('records email delivery and failure against the token that was sent', async () => {
    const { db, seen } = fakeSupabase([{ body: [] }, { body: [] }]);
    await db.markEmailSent(9, 'h1');
    await db.markEmailFailed(9, 'h1');
    expect(seen[0]?.query).toContain('cancel_hash=eq.h1');
    expect(seen[0]?.body).toHaveProperty('email_sent_at');
    expect(seen[1]?.query).toContain('cancel_hash=eq.h1');
    expect(seen[1]?.query).toContain('email_sent_at=is.null');
    expect(seen[1]?.body).toHaveProperty('email_failed_at');
  });

  it('claims a re-send in one conditional update', async () => {
    const { db, seen } = fakeSupabase([{ body: [{ id: 9 }] }, { body: [] }]);
    expect(await db.claimEmailRetry(9, 'h2')).toBe(true);
    expect(await db.claimEmailRetry(9, 'h3')).toBe(false);
    expect(seen[0]).toMatchObject({
      method: 'PATCH',
      body: { cancel_hash: 'h2', email_failed_at: null },
    });
    expect(seen[0]?.query).toContain('email_sent_at=is.null');
    expect(seen[0]?.query).toContain('or=(email_failed_at.not.is.null,cancel_hash.is.null)');
  });

  it('finds a gathering by its record id, current or not', async () => {
    const { db, seen } = fakeSupabase([
      {
        body: [
          {
            id: 3,
            title: 'T',
            date: '2027-01-30',
            time: '16:00',
            venue: 'V',
            capacity: 9,
            is_current: false,
          },
        ],
      },
      { body: [] },
    ]);
    expect(await db.eventById(3)).toMatchObject({ title: 'T', date: '2027-01-30' });
    expect(seen[0]?.query).toContain('id=eq.3');
    expect(await db.eventById(4)).toBeNull();
  });

  it('publishes, claims, finishes and imports through the database functions', async () => {
    const { db, seen } = fakeSupabase([
      {
        body: [
          { id: 5, title: 'T', date: '2027-09-09', status: 'published', audience: 'imported' },
        ],
      },
      {
        body: [
          {
            id: 9,
            announcement_id: 5,
            name: 'Ada',
            email: 'a@b.co',
            unsub_token: 'tok',
            claim_token: 'ct',
          },
        ],
      },
      { body: true },
      { body: null },
      { body: [{ added: 2, existing: 1, unsubscribed: 0 }] },
      { body: 'a@b.co' },
    ]);
    expect(await db.publishAnnouncement(5, 'imported')).toMatchObject({
      id: 5,
      audience: 'imported',
    });
    expect(seen[0]).toMatchObject({
      path: '/rest/v1/rpc/publish_announcement',
      body: { p_id: 5, p_scope: 'imported' },
    });
    expect(await db.claimOutbox(20, 350)).toEqual([
      {
        id: 9,
        announcementId: 5,
        name: 'Ada',
        email: 'a@b.co',
        unsubToken: 'tok',
        claimToken: 'ct',
      },
    ]);
    expect(seen[1]?.body).toEqual({ p_limit: 20, p_daily: 350 });
    expect(await db.beginOutbox(9, 'ct')).toBe(true);
    expect(seen[2]).toMatchObject({
      path: '/rest/v1/rpc/begin_announcement_send',
      body: { p_id: 9, p_token: 'ct' },
    });
    await db.finishOutbox(9, 'retry', 'smtp');
    expect(seen[3]).toMatchObject({
      path: '/rest/v1/rpc/finish_announcement_send',
      body: { p_id: 9, p_outcome: 'retry', p_error: 'smtp' },
    });
    expect(await db.importContacts([{ name: 'A', email: 'a@b.co' }], 'Sheet')).toEqual({
      added: 2,
      existing: 1,
      unsubscribed: 0,
    });
    expect(seen[4]?.body).toEqual({ p_people: [{ name: 'A', email: 'a@b.co' }], p_label: 'Sheet' });
    expect(await db.unsubscribe('tok')).toBe('a@b.co');
  });

  it('reads the whole mailing list a page at a time, by email', async () => {
    const page = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        name: 'N',
        email: `p${String(from + i).padStart(5, '0')}@x.co`,
        source: 'Sheet',
      }));
    const { db, seen } = fakeSupabase([
      { body: page(0, 1000) },
      { body: page(1000, 3) },
      { body: [] },
    ]);
    expect(await db.updatesAudience('imported')).toHaveLength(1003);
    expect(seen[0]?.body).toEqual({ p_scope: 'imported', p_after: '', p_limit: 1000 });
    expect(seen[1]?.body).toMatchObject({ p_after: 'p00999@x.co' });
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
