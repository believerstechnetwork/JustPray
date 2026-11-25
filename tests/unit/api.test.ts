import { beforeEach, describe, expect, it } from 'vitest';
import { csvCell, handleApi, reservationsByDay, type ApiDeps } from '../../server/api';
import { createSession, sessionIsValid } from '../../server/auth';
import { MemoryMailer } from '../../server/mailer';
import { MemoryDb } from '../../server/memory-db';

const EVENT = {
  title: 'Just Pray',
  date: '2027-01-30',
  time: '4:00 PM WAT',
  venue: 'Lagos',
  capacity: 2,
};
const PASSWORD = 'correct horse';
const BANK = { bankName: 'Bank', accountName: 'Just Pray', accountNumber: '0123456789' };
const USD_BANK = { ...BANK, accountNumber: '9876543210', swiftCode: 'BANKNGLA' };

let db: MemoryDb;
let mailer: MemoryMailer;
let deferred: Promise<unknown>[];
let deps: ApiDeps;

beforeEach(() => {
  db = new MemoryDb(EVENT);
  mailer = new MemoryMailer();
  deferred = [];
  deps = {
    db,
    mailer,
    banks: { NGN: BANK, USD: USD_BANK },
    adminPassword: PASSWORD,
    defer: (w) => void deferred.push(w),
    failedLoginDelayMs: 0,
    log: () => undefined,
  };
});

const call = async (
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: Record<string, unknown>; res: Response }> => {
  const res = await handleApi(
    new Request(`https://jp.test${path}`, {
      method,
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps,
  );
  const text = await res.clone().text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* CSV */
  }
  return { status: res.status, data, res };
};

const person = (email: string) => ({
  fullName: 'Ada Obi',
  email,
  phone: '+234 801 234 5678',
  privacy: 'on',
});

const adminCookie = () => ({ cookie: `jp_admin=${createSession(PASSWORD)}` });

describe('public API', () => {
  it('returns the event, seat count and bank details', async () => {
    const { status, data } = await call('GET', '/api/public');
    expect(status).toBe(200);
    expect(data).toEqual({ event: EVENT, reserved: 0, banks: { NGN: BANK, USD: USD_BANK } });
  });

  it('returns 503 when the database is not configured', async () => {
    deps.db = null;
    expect((await call('GET', '/api/public')).status).toBe(503);
  });

  it('reserves a seat and emails a confirmation', async () => {
    const { status, data } = await call('POST', '/api/reserve', person('Ada@Example.com'));
    expect(status).toBe(201);
    expect(data).toMatchObject({
      status: 'created',
      reservation: { seat: 1, code: 'JP-0001', name: 'Ada Obi', email: 'ada@example.com' },
      reserved: 1,
      capacity: 2,
      emailQueued: true,
    });
    await Promise.all(deferred);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe('ada@example.com');
    expect(mailer.sent[0]?.text).toContain('JP-0001');
    expect(db.reservations[0]?.emailSentAt).not.toBeNull();
  });

  it('does not leak details or re-send email for a repeat booking', async () => {
    await call('POST', '/api/reserve', person('ada@example.com'));
    await Promise.all(deferred);
    const { status, data } = await call('POST', '/api/reserve', {
      ...person('ADA@example.com'),
      fullName: 'Someone Else',
    });
    expect(status).toBe(200);
    expect(data).toEqual({ status: 'existing', reserved: 1, capacity: 2, emailQueued: false });
    expect(mailer.sent).toHaveLength(1);
  });

  it('retries the email for a repeat booking whose first email failed', async () => {
    deps.mailer = { kind: 'broken', send: () => Promise.reject(new Error('smtp down')) };
    await call('POST', '/api/reserve', person('ada@example.com'));
    await Promise.all(deferred);
    expect(db.reservations[0]?.emailSentAt).toBeNull();
    deps.mailer = mailer;
    const { data } = await call('POST', '/api/reserve', person('ada@example.com'));
    expect(data.emailQueued).toBe(true);
    await Promise.all(deferred);
    expect(mailer.sent).toHaveLength(1);
  });

  it('still reserves when email is not configured', async () => {
    deps.mailer = null;
    const { status, data } = await call('POST', '/api/reserve', person('a@b.co'));
    expect(status).toBe(201);
    expect(data.emailQueued).toBe(false);
  });

  it('reports a full gathering', async () => {
    await call('POST', '/api/reserve', person('a@b.co'));
    await call('POST', '/api/reserve', person('c@d.co'));
    const { status, data } = await call('POST', '/api/reserve', person('e@f.co'));
    expect(status).toBe(409);
    expect(data.status).toBe('full');
  });

  it('validates on the server and returns field errors', async () => {
    const { status, data } = await call('POST', '/api/reserve', { fullName: 'A', email: 'x' });
    expect(status).toBe(400);
    expect(Object.keys(data.fields as object).sort()).toEqual([
      'email',
      'name',
      'phone',
      'privacy',
    ]);
  });

  it('rejects the spam trap, non-JSON and oversized bodies', async () => {
    expect((await call('POST', '/api/reserve', { ...person('a@b.co'), website: 'x' })).status).toBe(
      400,
    );
    const notJson = await handleApi(
      new Request('https://jp.test/api/reserve', { method: 'POST', body: 'fullName=x' }),
      deps,
    );
    expect(notJson.status).toBe(415);
    expect((await call('POST', '/api/reserve', { pad: 'x'.repeat(20_000) })).status).toBe(413);
    expect(db.reservations).toHaveLength(0);
  });

  it('creates a contribution with a reference, then marks it sent', async () => {
    const { status, data } = await call('POST', '/api/contributions', {
      amount: '2500',
      name: 'Ada Obi',
      email: 'a@b.co',
    });
    expect(status).toBe(201);
    expect(data.reference).toMatch(/^JP-[A-Z0-9]{5}$/);
    expect(data.bank).toEqual(BANK);
    expect(data.currency).toBe('NGN');
    const sent = await call('POST', '/api/contributions/sent', { reference: data.reference });
    expect(sent.status).toBe(200);
    expect(db.contributions[0]?.markedSentAt).not.toBeNull();
    expect((await call('POST', '/api/contributions/sent', { reference: 'JP-ZZZZZ' })).status).toBe(
      404,
    );
  });

  it('gives the dollar account for a dollar contribution', async () => {
    const { status, data } = await call('POST', '/api/contributions', {
      currency: 'USD',
      amount: '25',
      name: 'Ada Obi',
      email: 'a@b.co',
    });
    expect(status).toBe(201);
    expect(data).toMatchObject({ currency: 'USD', amount: 25, bank: USD_BANK });
    expect(db.contributions[0]?.currency).toBe('USD');
    const bad = await call('POST', '/api/contributions', {
      currency: 'EUR',
      amount: '25',
      name: 'Ada',
      email: 'a@b.co',
    });
    expect(bad.status).toBe(400);
  });

  it('refuses a currency whose account is not set up', async () => {
    deps.banks = { NGN: BANK, USD: null };
    const r = await call('POST', '/api/contributions', {
      currency: 'USD',
      amount: '25',
      name: 'Ada',
      email: 'a@b.co',
    });
    expect(r.status).toBe(503);
    expect(r.data.error).toContain('Dollar transfers are not set up');
  });

  it('refuses contributions until bank details are set', async () => {
    deps.banks = { NGN: null, USD: null };
    const r = await call('POST', '/api/contributions', {
      amount: '2500',
      name: 'Ada',
      email: 'a@b.co',
    });
    expect(r.status).toBe(503);
  });

  it('turns unexpected errors into a 500 without details', async () => {
    db.currentEvent = () => Promise.reject(new Error('secret connection string'));
    const { status, data } = await call('GET', '/api/public');
    expect(status).toBe(500);
    expect(JSON.stringify(data)).not.toContain('secret');
  });
});

describe('organiser API', () => {
  it('requires a session', async () => {
    expect((await call('GET', '/api/admin/data')).status).toBe(401);
    expect(
      (await call('GET', '/api/admin/data', undefined, { cookie: 'jp_admin=1.abc' })).status,
    ).toBe(401);
  });

  it('is off when no admin password is set', async () => {
    deps.adminPassword = '';
    expect((await call('POST', '/api/admin/login', { password: '' })).status).toBe(503);
    expect((await call('GET', '/api/admin/data', undefined, adminCookie())).status).toBe(503);
  });

  it('signs in with the right password only', async () => {
    expect((await call('POST', '/api/admin/login', { password: 'wrong' })).status).toBe(401);
    const { status, res } = await call('POST', '/api/admin/login', { password: PASSWORD });
    expect(status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^jp_admin=\d+\.[\w-]+; Path=\/api; HttpOnly; SameSite=Strict/);
    expect(cookie).toContain('Secure');
    const token = cookie.split(';')[0]?.split('=')[1];
    expect(
      (await call('GET', '/api/admin/data', undefined, { cookie: `jp_admin=${token}` })).status,
    ).toBe(200);
  });

  it('confirms contributions and totals only confirmed ones', async () => {
    const a = await call('POST', '/api/contributions', {
      amount: '1000',
      name: 'Ada',
      email: 'a@b.co',
    });
    await call('POST', '/api/contributions/sent', { reference: a.data.reference });
    await call('POST', '/api/contributions', { amount: '5000', name: 'Bo', email: 'c@d.co' });
    const id = db.contributions[0]?.id;

    let { data } = await call('GET', '/api/admin/data', undefined, adminCookie());
    expect(data.totals).toEqual({
      confirmed: { NGN: 0, USD: 0 },
      confirmedCount: 0,
      supporters: 0,
      pending: { NGN: 1000, USD: 0 },
      pendingCount: 1,
    });

    const r = await call(
      'POST',
      `/api/admin/contributions/${id}`,
      { status: 'confirmed' },
      adminCookie(),
    );
    expect(r.status).toBe(200);
    ({ data } = await call('GET', '/api/admin/data', undefined, adminCookie()));
    expect(data.totals).toMatchObject({
      confirmed: { NGN: 1000, USD: 0 },
      supporters: 1,
      pending: { NGN: 0, USD: 0 },
    });

    // Dollars are totalled separately from naira.
    await call('POST', '/api/contributions', {
      currency: 'USD',
      amount: '40',
      name: 'Cy',
      email: 'e@f.co',
    });
    const usdId = db.contributions.at(-1)?.id;
    await call('POST', `/api/admin/contributions/${usdId}`, { status: 'confirmed' }, adminCookie());
    ({ data } = await call('GET', '/api/admin/data', undefined, adminCookie()));
    expect(data.totals).toMatchObject({ confirmed: { NGN: 1000, USD: 40 }, supporters: 2 });

    expect(
      (await call('POST', `/api/admin/contributions/${id}`, { status: 'paid' }, adminCookie()))
        .status,
    ).toBe(400);
    expect(
      (await call('POST', `/api/admin/contributions/${id}`, { status: 'confirmed' })).status,
    ).toBe(401);
  });

  it('updates the event, refusing capacity below seats taken', async () => {
    await call('POST', '/api/reserve', person('a@b.co'));
    await call('POST', '/api/reserve', person('c@d.co'));
    const next = { ...EVENT, venue: 'New venue', capacity: 1 };
    expect((await call('PUT', '/api/admin/event', next, adminCookie())).status).toBe(400);
    const ok = await call('PUT', '/api/admin/event', { ...next, capacity: 50 }, adminCookie());
    expect(ok.status).toBe(200);
    expect((await call('GET', '/api/public')).data.event).toMatchObject({
      venue: 'New venue',
      capacity: 50,
    });
    expect(
      (await call('PUT', '/api/admin/event', { ...next, date: 'soon' }, adminCookie())).status,
    ).toBe(400);
  });

  it('refuses a capacity cut when the database finds more bookings than the pre-check', async () => {
    // A booking lands between the early count and the write: the database's answer wins.
    db.reservedCount = () => Promise.resolve(0);
    db.updateEvent = () => Promise.resolve({ ok: false, reserved: 3 });
    const r = await call('PUT', '/api/admin/event', { ...EVENT, capacity: 2 }, adminCookie());
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('Capacity cannot be below the 3 seats already reserved.');
  });

  it('exports reservations as CSV', async () => {
    await call('POST', '/api/reserve', { ...person('a@b.co'), fullName: '=HYPERLINK("x")' });
    const { status, res } = await call(
      'GET',
      '/api/admin/reservations.csv',
      undefined,
      adminCookie(),
    );
    expect(status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text.split('\r\n')[0]).toContain('"Seat","Code","Name"');
    expect(text).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('helpers', () => {
  it('signs sessions that expire and break when the password changes', () => {
    const t = createSession('pw', 1000);
    expect(sessionIsValid(t, 'pw', 2000)).toBe(true);
    expect(sessionIsValid(t, 'other', 2000)).toBe(false);
    expect(sessionIsValid(t, 'pw', 1000 + 13 * 3600_000)).toBe(false);
    expect(sessionIsValid(`${t}x`, 'pw', 2000)).toBe(false);
  });

  it('counts reservations per Lagos day', () => {
    const now = new Date('2027-01-10T12:00:00Z');
    const r = (createdAt: string) =>
      ({ createdAt }) as Parameters<typeof reservationsByDay>[0][number];
    const days = reservationsByDay(
      [r('2027-01-10T08:00:00Z'), r('2027-01-09T23:30:00Z'), r('2026-12-01T00:00:00Z')],
      now,
    );
    expect(days).toHaveLength(7);
    // 23:30 UTC on the 9th is 00:30 on the 10th in Lagos.
    expect(days.at(-1)).toEqual({ date: '2027-01-10', count: 2 });
    expect(days.reduce((t, d) => t + d.count, 0)).toBe(2);
  });

  it('neutralises spreadsheet formulas in CSV cells', () => {
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    expect(csvCell('+234 801')).toBe(`"'+234 801"`);
    expect(csvCell('Ada "A" Obi')).toBe('"Ada ""A"" Obi"');
  });
});
