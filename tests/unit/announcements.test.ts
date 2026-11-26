import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announcementEmail } from '../../server/emails';
import { handleApi, type ApiDeps } from '../../server/api';
import { createSession } from '../../server/auth';
import { GmailMailer, MemoryMailer, ResendMailer } from '../../server/mailer';
import { MemoryDb } from '../../server/memory-db';
import { processOutbox } from '../../server/outbox';
import {
  importBatches,
  importInBatches,
  parseCsv,
  rowsToContacts,
  startImport,
} from '../../src/lib/contacts';
import { dateBlock, upcomingCard } from '../../src/views/announcements';

const EVENT = {
  title: 'Just Pray',
  date: '2027-01-30',
  time: '16:00',
  venue: 'Lagos',
  capacity: 50,
};
const PASSWORD = 'pw';
const ANN = {
  title: 'BTN Conference 2027',
  date: '2027-09-09',
  endDate: '2027-09-11',
  time: '09:00',
  theme: '',
  themeTba: true,
  venue: 'Lagos',
  venueTba: true,
  summary: 'Three days of worship and teaching.',
  imageUrl: '',
  linkUrl: 'https://example.org/register',
  linkLabel: 'Register interest',
  subject: 'Save the date: BTN Conference 2027',
  message: 'Hi {first name},\n\nSee you there.',
};

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
    banks: { NGN: null, USD: null },
    adminPassword: PASSWORD,
    defer: (w) => void deferred.push(w),
    failedLoginDelayMs: 0,
    log: () => undefined,
    testEmail: 'team@example.org',
  };
});

const admin = { cookie: `jp_admin=${createSession(PASSWORD)}` };
const call = async (method: string, path: string, body?: unknown, headers = admin) => {
  const res = await handleApi(
    new Request(`https://jp.test${path}`, {
      method,
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    deps,
  );
  // Test-only: response bodies are read loosely and checked with expect().
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, any> };
};

const book = (email: string, updates: boolean) =>
  call('POST', '/api/reserve', {
    fullName: 'Ada Obi',
    email,
    phone: '+234 801 234 5678',
    privacy: 'on',
    ...(updates ? { updates: 'on' } : {}),
  });

describe('the date drawn on an event card', () => {
  const text = (html: string): string[] =>
    [...html.matchAll(/class="(m|d|y)">([^<]*)</g)].map((m) => `${m[1]}:${m[2]}`);

  it('shows one day, a range in one month, and a range across months or years', () => {
    expect(text(dateBlock('2027-09-18'))).toEqual(['m:Sep', 'd:18', 'y:2027']);
    expect(text(dateBlock('2027-09-18', '2027-09-19'))).toEqual(['m:Sep', 'd:18–19', 'y:2027']);
    expect(text(dateBlock('2027-09-30', '2027-10-02'))).toEqual([
      'm:Sep – Oct',
      'd:30–2',
      'y:2027',
    ]);
    expect(text(dateBlock('2027-12-30', '2028-01-01'))).toEqual([
      'm:Dec – Jan',
      'd:30–1',
      'y:2027–28',
    ]);
  });

  it('ignores an end date that is not after the start, and is hidden from screen readers', () => {
    expect(text(dateBlock('2027-09-18', '2027-09-18'))).toEqual(['m:Sep', 'd:18', 'y:2027']);
    expect(dateBlock('2027-09-18')).toContain('aria-hidden="true"');
    expect(dateBlock('not a date')).toBe('');
  });
});

describe('event cards', () => {
  it('turns only a web address into a button, never a javascript: link', () => {
    const card = (linkUrl: string) =>
      upcomingCard({
        title: 'BTN Conference',
        date: '2027-09-09',
        endDate: null,
        time: null,
        theme: null,
        themeTba: false,
        venue: 'Lagos',
        venueTba: false,
        summary: 'S',
        imageUrl: null,
        linkUrl,
        linkLabel: 'Register',
      });
    expect(card('https://example.com/register')).toContain('href="https://example.com/register"');
    expect(card('javascript:alert(1)')).not.toContain('href=');
  });
});

describe('reading a spreadsheet', () => {
  it('uses the Name and Email headings, keeps each email once and counts bad rows', () => {
    const out = rowsToContacts([
      ['Full name', 'Phone', 'E-mail address'],
      ['Ada Obi', '0801', 'Ada@Example.com'],
      ['Bola', '', 'not-an-email'],
      ['Ada again', '', 'ada@example.com'],
      [null, null, null],
      ['Chi Eze', '0803', ' chi@example.com '],
    ]);
    expect(out.contacts).toEqual([
      { name: 'Ada Obi', email: 'ada@example.com' },
      { name: 'Chi Eze', email: 'chi@example.com' },
    ]);
    expect(out.invalid).toBe(1);
    expect(out.duplicates).toBe(1);
  });

  it('joins first and last names, and finds emails in a sheet without headings', () => {
    expect(
      rowsToContacts([
        ['First name', 'Last name', 'Email'],
        ['Ada', 'Obi', 'a@b.co'],
      ]).contacts,
    ).toEqual([{ name: 'Ada Obi', email: 'a@b.co' }]);
    expect(rowsToContacts([['Bola Ade', 'bola@x.co', '0802']]).contacts).toEqual([
      { name: 'Bola Ade', email: 'bola@x.co' },
    ]);
  });

  it('picks the separator from the first line with content, after blank lines', () => {
    // (The blank line itself is dropped later, with the other empty rows.)
    expect(parseCsv('\r\nName;Email\r\nAda;ada@example.com').filter((r) => r.join(''))).toEqual([
      ['Name', 'Email'],
      ['Ada', 'ada@example.com'],
    ]);
  });

  it('skips a first record that is only empty quoted cells when picking the separator', () => {
    const rows = parseCsv('""\r\nName;Email\r\nAda;ada@example.com').filter((r) => r.join(''));
    expect(rows).toEqual([
      ['Name', 'Email'],
      ['Ada', 'ada@example.com'],
    ]);
    expect(rowsToContacts(rows).contacts).toEqual([{ name: 'Ada', email: 'ada@example.com' }]);
  });

  it('treats a first row with an address as data, even if a cell mentions email', () => {
    expect(
      rowsToContacts([
        ['Email Team', 'ada@example.com'],
        ['Bola', 'bola@example.com'],
      ]).contacts,
    ).toEqual([
      { name: 'Email Team', email: 'ada@example.com' },
      { name: 'Bola', email: 'bola@example.com' },
    ]);
  });

  it('picks the address column over an opt-in column that also mentions email', () => {
    const out = rowsToContacts([
      ['Name', 'Email Opt-In', 'Email'],
      ['Ada', 'Yes', 'ada@example.com'],
    ]);
    expect(out.contacts).toEqual([{ name: 'Ada', email: 'ada@example.com' }]);
    expect(out.invalid).toBe(0);
    // Without a plain "Email" heading, the email-ish column that holds addresses wins.
    expect(
      rowsToContacts([
        ['Name', 'Email opt-in', 'Work email'],
        ['Bola', 'No', 'bola@example.com'],
      ]).contacts,
    ).toEqual([{ name: 'Bola', email: 'bola@example.com' }]);
  });

  it('reads CSV with quotes, commas, semicolons and Windows line ends', () => {
    expect(parseCsv('﻿Name,Email\r\n"Obi, Ada",a@b.co\r\n"Say ""hi""",c@d.co')).toEqual([
      ['Name', 'Email'],
      ['Obi, Ada', 'a@b.co'],
      ['Say "hi"', 'c@d.co'],
    ]);
    expect(parseCsv('Name;Email\nAda;a@b.co\n')).toEqual([
      ['Name', 'Email'],
      ['Ada', 'a@b.co'],
    ]);
  });
});

describe('importing people', () => {
  it('adds new people, skips those already on the list or unsubscribed, and counts bad rows', async () => {
    await book('booked@example.com', true);
    db.unsubscribed.add('gone@example.com');
    const { status, data } = await call('POST', '/api/admin/contacts/import', {
      label: 'Conference 2026',
      people: [
        { name: 'New One', email: 'New@Example.com' },
        { name: 'Booked', email: 'booked@example.com' },
        { name: 'Gone', email: 'gone@example.com' },
        { name: 'Bad', email: 'nope' },
      ],
    });
    expect(status).toBe(200);
    // Someone who booked is still added: imported membership does not depend on bookings.
    expect(data).toEqual({ added: 2, existing: 0, unsubscribed: 1, invalid: 1 });
    const again = await call('POST', '/api/admin/contacts/import', {
      label: 'x',
      people: [{ name: 'New One', email: 'new@example.com' }],
    });
    expect(again.data).toMatchObject({ added: 0, existing: 1 });
    const { data: list } = await call('GET', '/api/admin/audience');
    expect(list.people).toEqual([
      { name: 'Ada Obi', email: 'booked@example.com', source: 'Booked a seat' },
      { name: 'New One', email: 'new@example.com', source: 'Conference 2026' },
    ]);
  });

  it('accepts 5,000 people with the longest names and emails in one import', async () => {
    const people = Array.from({ length: 5000 }, (_, i) => ({
      name: 'N'.repeat(120),
      email: `${String(i).padStart(5, '0')}${'x'.repeat(230)}@example.com`,
    }));
    const { status, data } = await call('POST', '/api/admin/contacts/import', {
      label: 'Big sheet',
      people,
    });
    expect(status).toBe(200);
    expect(data).toMatchObject({ added: 5000 });
  });

  it('splits a list of names full of escaped characters into batches the server accepts', async () => {
    // 5,000 people whose names are all quote marks: each doubles in JSON, so one request would be
    // too large. Batches keep every request small, and together they add everyone once.
    const people = Array.from({ length: 5000 }, (_, i) => ({
      name: '"'.repeat(120),
      email: `${String(i).padStart(5, '0')}${'x'.repeat(230)}@example.com`,
    }));
    const batches = importBatches(people);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toEqual(people);
    let added = 0;
    for (const batch of batches) {
      const body = JSON.stringify({ label: 'Quotes', people: batch });
      expect(body.length).toBeLessThan(1_100_000);
      const { status, data } = await call('POST', '/api/admin/contacts/import', {
        label: 'Quotes',
        people: batch,
      });
      expect(status).toBe(200);
      added += data.added as number;
    }
    expect(added).toBe(5000);
  });

  it('keeps what a failed batch import saved, and a retry sends only the rest', async () => {
    const people = Array.from({ length: 30 }, (_, i) => ({
      name: `Person ${i}`,
      email: `p${i}@example.com`,
    }));
    const send = async (batch: typeof people) => {
      const { status, data } = await call('POST', '/api/admin/contacts/import', {
        label: 'Retry',
        people: batch,
      });
      if (status !== 200) throw new Error(`HTTP ${status}`);
      return data as { added: number; existing: number; unsubscribed: number; invalid: number };
    };
    const maxChars = 400; // about 10 people a batch
    expect(importBatches(people, maxChars).length).toBeGreaterThanOrEqual(3);

    // The second batch fails after the first is saved.
    const progress = startImport();
    const sent: number[] = [];
    let calls = 0;
    const failSecond = async (batch: typeof people) => {
      if (++calls === 2) throw new Error('network');
      sent.push(batch.length);
      return send(batch);
    };
    await expect(importInBatches(people, progress, failSecond, maxChars)).rejects.toThrow(
      'network',
    );
    expect(progress.done).toBe(sent[0]);
    expect(progress.counts).toEqual({
      added: sent[0],
      existing: 0,
      unsubscribed: 0,
      invalid: 0,
    });

    // The retry starts after the saved people, so nobody is counted as already on the list.
    const retried: string[] = [];
    await importInBatches(
      people,
      progress,
      (batch) => {
        retried.push(...batch.map((p) => p.email));
        return send(batch);
      },
      maxChars,
    );
    expect(retried).toEqual(people.slice(sent[0]).map((p) => p.email));
    expect(progress).toEqual({
      done: 30,
      counts: { added: 30, existing: 0, unsubscribed: 0, invalid: 0 },
    });
  });

  it('needs a signed-in organiser and refuses an empty list', async () => {
    expect(
      (await call('POST', '/api/admin/contacts/import', { people: [] }, { cookie: '' })).status,
    ).toBe(401);
    expect((await call('POST', '/api/admin/contacts/import', { people: [] })).status).toBe(400);
  });
});

describe('publishing and sending', () => {
  const draft = async () =>
    (await call('POST', '/api/admin/announcements', ANN)).data.announcement.id as number;

  beforeEach(async () => {
    await book('booked@example.com', true);
    await book('quiet@example.com', false);
    await call('POST', '/api/admin/contacts/import', {
      label: 'Sheet',
      people: [
        { name: 'Imported Person', email: 'imp@example.com' },
        { name: 'Ada Obi', email: 'booked@example.com' },
      ],
    });
    await Promise.all(deferred);
    mailer.sent = [];
    deferred = [];
  });

  it('counts each list and both together, once per person', async () => {
    const { data } = await call('GET', '/api/admin/announcements');
    expect(data.counts).toEqual({ all: 2, booked: 1, imported: 2 });
  });

  it.each([
    ['booked', ['booked@example.com']],
    ['imported', ['booked@example.com', 'imp@example.com']],
    ['all', ['booked@example.com', 'imp@example.com']],
  ])('sends to %s', async (audience, expected) => {
    const id = await draft();
    const pub = await call('POST', `/api/admin/announcements/${id}/publish`, { audience });
    expect(pub.data.announcement).toMatchObject({
      status: 'published',
      audience,
      recipients: expected.length,
    });
    await Promise.all(deferred);
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(expected);
    expect(
      mailer.sent.every(
        (m) => m.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click',
      ),
    ).toBe(true);
    // Never to someone who did not ask for updates.
    expect(mailer.sent.map((m) => m.to)).not.toContain('quiet@example.com');
  });

  it('refuses a date that does not exist, and keeps leap days', async () => {
    const post = (date: string, endDate: string | null = null) =>
      call('POST', '/api/admin/announcements', { ...ANN, date, endDate });
    // 30 February would otherwise roll over into March.
    expect((await post('2027-02-30')).status).toBe(400);
    expect((await post('2027-09-09', '2027-09-31')).status).toBe(400);
    expect((await post('2027-13-01')).status).toBe(400);
    expect((await post('2028-02-29')).status).toBe(201);
    expect((await post('2027-09-09', '2027-09-09')).status).toBe(201);
  });

  it('publishes once, and refuses an unknown audience', async () => {
    const id = await draft();
    expect(
      (await call('POST', `/api/admin/announcements/${id}/publish`, { audience: 'everyone' }))
        .status,
    ).toBe(400);
    expect(
      (await call('POST', `/api/admin/announcements/${id}/publish`, { audience: 'all' })).status,
    ).toBe(200);
    expect(
      (await call('POST', `/api/admin/announcements/${id}/publish`, { audience: 'all' })).status,
    ).toBe(400);
    await Promise.all(deferred);
    expect(mailer.sent).toHaveLength(2);
  });

  it('keeps to the daily limit and retries failures up to three times', async () => {
    const id = await draft();
    deps.dailyLimit = 1;
    await call('POST', `/api/admin/announcements/${id}/publish`, { audience: 'all' });
    await Promise.all(deferred);
    expect(mailer.sent).toHaveLength(1);
    // The second waits for tomorrow.
    expect(
      (await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 20, dailyLimit: 1 }))
        .sent,
    ).toBe(0);
    // A refusal the mail service answered (so nothing went out) may be tried again.
    const broken = {
      kind: 'broken',
      send: () => Promise.reject(new Error('smtp')),
      canRetry: () => true,
    };
    for (let i = 0; i < 4; i++)
      await processOutbox({
        db,
        mailer: broken,
        siteUrl: 'https://jp.test',
        limit: 20,
        dailyLimit: 99,
      });
    const failed = db.outbox.filter((o) => o.status === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.attempts).toBe(3);
    expect((await db.announcementById(id))?.sentCount).toBe(1);
    expect((await db.announcementById(id))?.unsentCount).toBe(1);
  });

  it('unsubscribes from the link, skips what was queued, and leaves them out next time', async () => {
    const id = await draft();
    deps.dailyLimit = 1;
    await call('POST', `/api/admin/announcements/${id}/publish`, { audience: 'all' });
    await Promise.all(deferred);
    const waiting = db.outbox.find((o) => o.status === 'pending');
    expect(waiting).toBeDefined();
    const res = await call('POST', '/api/unsubscribe', { token: waiting?.unsubToken });
    expect(res.status).toBe(200);
    expect(db.outbox.find((o) => o.id === waiting?.id)?.status).toBe('skipped');
    expect((await call('GET', '/api/admin/announcements')).data.counts.all).toBe(1);
    // One-click unsubscribe from the mail app: POST with the token in the address.
    const sent = db.outbox.find((o) => o.status === 'sent');
    const oneClick = await handleApi(
      new Request(`https://jp.test/api/unsubscribe?t=${sent?.unsubToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
      deps,
    );
    expect(oneClick.status).toBe(200);
    expect((await call('GET', '/api/admin/announcements')).data.counts.all).toBe(0);
    expect((await call('POST', '/api/unsubscribe', { token: 'x'.repeat(32) })).status).toBe(404);
  });

  it('shows and changes email preferences from the link, with the email partly hidden', async () => {
    const id = await draft();
    await call('POST', `/api/admin/announcements/${id}/publish`, { audience: 'imported' });
    await Promise.all(deferred);
    const token = db.outbox.find((o) => o.email === 'imp@example.com')?.unsubToken;
    const look = await call('POST', '/api/preferences', { token });
    expect(look.data).toEqual({ email: 'im•••@example.com', subscribed: true });
    expect(
      (await call('POST', '/api/preferences', { token, action: 'unsubscribe' })).data,
    ).toMatchObject({
      subscribed: false,
    });
    expect((await call('GET', '/api/admin/announcements')).data.counts.imported).toBe(1);
    expect(
      (await call('POST', '/api/preferences', { token, action: 'resubscribe' })).data,
    ).toMatchObject({
      subscribed: true,
    });
    expect((await call('GET', '/api/admin/announcements')).data.counts.imported).toBe(2);
    expect((await call('POST', '/api/preferences', { token: 'nope' })).status).toBe(404);
    expect(mailer.sent[0]?.text).toContain(
      'Unsubscribe or manage your emails: https://justprayy.netlify.app/#/unsubscribe/',
    );
  });

  it('sends a test to the organiser, marked as a test, without publishing', async () => {
    const res = await call('POST', '/api/admin/announcements/test', {
      ...ANN,
      to: 'me@example.org',
    });
    expect(res.status).toBe(200);
    expect(mailer.sent[0]?.to).toBe('me@example.org');
    expect(mailer.sent[0]?.subject).toBe('[Test] Save the date: BTN Conference 2027');
    expect(mailer.sent[0]?.text).toContain('Hi Organiser,');
    expect(db.outbox).toHaveLength(0);
    expect(
      (await call('POST', '/api/admin/announcements/test', { ...ANN, to: 'nope' })).status,
    ).toBe(400);
  });

  it('shows "to be announced" theme and venue in the email', async () => {
    const id = await draft();
    await call('POST', `/api/admin/announcements/${id}/publish`, { audience: 'booked' });
    await Promise.all(deferred);
    const text = mailer.sent[0]?.text ?? '';
    expect(text).toContain('Where: Lagos · venue to be announced');
    expect(text).toContain('Theme: To be announced');
    expect(text).toMatch(/^Hi Ada,/);
  });
});

describe('review fixes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never turns a visitor name into a link, and inserts it literally', () => {
    const a = {
      title: 'T',
      date: '2027-09-09',
      venue: 'Lagos',
      summary: 's',
      subject: 'S',
      message: 'Hi {first name},\n\nSee [our site](https://example.org).',
    };
    const evil = announcementEmail({
      announcement: a,
      name: '[Verify](https://evil.example/login)',
      email: 'x@y.co',
      siteUrl: 'https://jp.test',
      unsubscribeUrl: 'https://jp.test/u',
    });
    expect(evil.html).not.toContain('href="https://evil.example');
    expect(evil.html).toContain('[Verify](https://evil.example/login)');
    expect(evil.html).toContain('href="https://example.org"');
    expect(evil.text).toContain('Hi [Verify](https://evil.example/login),');
    const dollar = announcementEmail({
      announcement: a,
      name: '$& Obi',
      email: 'x@y.co',
      siteUrl: 'https://jp.test',
      unsubscribeUrl: 'u',
    });
    expect(dollar.text).toMatch(/^Hi \$&,/);
  });

  it('reads a headerless first row with an address, and a semicolon CSV with a quoted comma', () => {
    expect(
      rowsToContacts([
        ['Ada', 'email@example.com'],
        ['Bola', 'b@x.co'],
      ]).contacts,
    ).toEqual([
      { name: 'Ada', email: 'email@example.com' },
      { name: 'Bola', email: 'b@x.co' },
    ]);
    const rows = parseCsv('"Full name, surname";Email\nAda;a@b.co');
    expect(rows).toEqual([
      ['Full name, surname', 'Email'],
      ['Ada', 'a@b.co'],
    ]);
    expect(rowsToContacts(rows).contacts).toEqual([{ name: 'Ada', email: 'a@b.co' }]);
  });

  it('forwards extra headers through Resend', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await new ResendMailer('key', 'Just Pray <hi@x.co>').send({
      to: 'a@b.co',
      subject: 's',
      text: 't',
      html: 'h',
      headers: { 'List-Unsubscribe': '<https://x/u>' },
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toMatchObject({
      headers: { 'List-Unsubscribe': '<https://x/u>' },
    });
  });

  it('forwards the idempotency key in the Resend request header', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const resend = new ResendMailer('key', 'Just Pray <hi@x.co>');
    await resend.send({ to: 'a@b.co', subject: 's', text: 't', html: 'h', idempotencyKey: 'k-1' });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k-1');
    expect(JSON.parse(String(init.body))).not.toHaveProperty('idempotencyKey');
  });

  it('retries a Resend failure only when Resend answered and refused the email', async () => {
    const resend = new ResendMailer('key', 'Just Pray <hi@x.co>');
    const failWith = async (res: () => Promise<Response>): Promise<unknown> => {
      vi.stubGlobal('fetch', vi.fn(res));
      return resend.send({ to: 'a@b.co', subject: 's', text: 't', html: 'h' }).then(
        () => null,
        (e: unknown) => e,
      );
    };
    expect(resend.canRetry(await failWith(async () => new Response('', { status: 429 })))).toBe(
      true,
    );
    // 408 and 409 (a send with the same key still in progress) leave the outcome open.
    expect(resend.canRetry(await failWith(async () => new Response('', { status: 408 })))).toBe(
      false,
    );
    expect(resend.canRetry(await failWith(async () => new Response('', { status: 409 })))).toBe(
      false,
    );
    // A 5xx or a timeout may come after Resend took the email; a retry could land after the
    // idempotency key's 24 hours, so neither is retried.
    expect(resend.canRetry(await failWith(async () => new Response('', { status: 502 })))).toBe(
      false,
    );
    expect(
      resend.canRetry(
        await failWith(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))),
      ),
    ).toBe(false);
    // The connection was refused or the name did not resolve: the request never reached Resend.
    const refused = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    expect(resend.canRetry(await failWith(() => Promise.reject(refused)))).toBe(true);
    // A connection dropped part-way is uncertain.
    const reset = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
    expect(resend.canRetry(await failWith(() => Promise.reject(reset)))).toBe(false);
  });

  it('gives each Gmail send one deadline for the whole exchange', async () => {
    const gmail = new GmailMailer('me@gmail.com', 'app password');
    const sendMail = vi.fn(async () => ({}));
    (gmail as unknown as { transport: { sendMail: typeof sendMail } }).transport = { sendMail };
    const deadline = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline);
    try {
      await gmail.send({ to: 'a@b.co', subject: 's', text: 't', html: 'h', idempotencyKey: 'k' });
      // A 12-second deadline, and that very signal is what the transport gets.
      expect(timeout).toHaveBeenCalledWith(12_000);
    } finally {
      timeout.mockRestore();
    }
    const options = (sendMail.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(options.signal).toBe(deadline);
    // Gmail has no idempotency keys, so none is passed on.
    expect(options).not.toHaveProperty('idempotencyKey');
    // An aborted send may have been accepted, so it is never retried.
    expect(gmail.canRetry(Object.assign(new Error('aborted'), { code: 'EABORT' }))).toBe(false);
  });

  it('retries a Gmail failure only when Gmail certainly did not take the email', () => {
    const gmail = new GmailMailer('me@gmail.com', 'app password');
    // Refused before the greeting, or the name did not resolve: nothing reached Gmail.
    expect(gmail.canRetry(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBe(
      true,
    );
    expect(gmail.canRetry(Object.assign(new Error('no such host'), { code: 'ENOTFOUND' }))).toBe(
      true,
    );
    expect(gmail.canRetry(Object.assign(new Error('450 busy'), { responseCode: 450 }))).toBe(true);
    expect(gmail.canRetry(Object.assign(new Error('bad login'), { code: 'EAUTH' }))).toBe(true);
    // A timeout or dropped connection may come after Gmail accepted it.
    expect(gmail.canRetry(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe(false);
    expect(gmail.canRetry(Object.assign(new Error('closed'), { code: 'ECONNECTION' }))).toBe(false);
    expect(gmail.canRetry(new Error('unknown'))).toBe(false);
  });

  it('never retries a send that may have been delivered', async () => {
    const id = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    db.contacts.push({ name: 'A', email: 'a@x.co', source: 'Sheet' });
    await db.publishAnnouncement(id, 'imported');
    let tries = 0;
    const flaky = {
      kind: 'flaky',
      send: () => {
        tries++;
        return Promise.reject(new Error('timeout'));
      },
      canRetry: () => false,
    };
    for (let i = 0; i < 3; i++)
      await processOutbox({
        db,
        mailer: flaky,
        siteUrl: 'https://jp.test',
        limit: 10,
        dailyLimit: 99,
      });
    expect(tries).toBe(1);
    expect(db.outbox[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(db.outbox[0]?.error).toMatch(/may have been delivered/);
    // Counted for 24 hours from when the attempt ended, not from when it was claimed.
    db.outbox[0]!.claimedAt -= 25 * 3_600_000;
    db.outbox[0]!.finishedAt! -= 23 * 3_600_000;
    // It still counts toward today's limit.
    db.contacts.push({ name: 'B', email: 'b@x.co', source: 'Sheet' });
    const id2 = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    await db.publishAnnouncement(id2, 'imported');
    expect(await db.claimOutbox(10, 1)).toHaveLength(0);
  });

  it('puts an email back in the queue when the subscription check fails, and sends the rest', async () => {
    const id = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    for (const e of ['a@x.co', 'b@x.co']) db.contacts.push({ name: 'A', email: e, source: 'S' });
    await db.publishAnnouncement(id, 'imported');
    const realCheck = db.isUnsubscribed.bind(db);
    db.isUnsubscribed = async (email) => {
      if (email === 'a@x.co') throw new Error('db blip');
      return realCheck(email);
    };
    const res = await processOutbox({
      db,
      mailer,
      siteUrl: 'https://jp.test',
      limit: 10,
      dailyLimit: 99,
    });
    expect(res).toEqual({ sent: 1, failed: 1 });
    expect(mailer.sent.map((m) => m.to)).toEqual(['b@x.co']);
    expect(db.outbox.find((o) => o.email === 'a@x.co')).toMatchObject({
      status: 'pending',
      attempts: 1,
    });
    // Next run, with the database back, sends it.
    db.isUnsubscribed = realCheck;
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 10, dailyLimit: 99 });
    expect(mailer.sent.map((m) => m.to)).toEqual(['b@x.co', 'a@x.co']);
  });

  it('skips a claimed email if the person unsubscribed before it went out', async () => {
    const id = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    db.contacts.push({ name: 'A', email: 'a@x.co', source: 'Sheet' });
    await db.publishAnnouncement(id, 'imported');
    const claimed = await db.claimOutbox(10, 99);
    expect(claimed).toHaveLength(1);
    db.unsubscribed.add('a@x.co');
    // The batch already holds the claim; the send loop re-checks just before sending.
    db.claimOutbox = async () => claimed;
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 10, dailyLimit: 99 });
    expect(mailer.sent).toHaveLength(0);
    expect(db.outbox[0]?.status).toBe('skipped');
  });

  it('never sends twice when recording a delivered email fails', async () => {
    const id = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    db.contacts.push({ name: 'A', email: 'a@x.co', source: 'Sheet' });
    await db.publishAnnouncement(id, 'imported');
    const realFinish = db.finishOutbox.bind(db);
    db.finishOutbox = async (i, token, outcome, e) => {
      if (outcome === 'sent') throw new Error('db down');
      return realFinish(i, token, outcome, e);
    };
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 10, dailyLimit: 99 });
    expect(mailer.sent).toHaveLength(1);
    expect(db.outbox[0]?.status).toBe('sending');
    // Later runs: still claimed, then closed as failed once stale; never sent again.
    db.finishOutbox = realFinish;
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 10, dailyLimit: 99 });
    db.outbox[0]!.claimedAt -= 11 * 60_000;
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 10, dailyLimit: 99 });
    expect(db.outbox[0]).toMatchObject({ status: 'failed', error: 'Sending did not finish' });
    expect(mailer.sent).toHaveLength(1);
    // That uncertain email still counts toward today's limit.
    db.contacts.push({ name: 'B', email: 'b@x.co', source: 'Sheet' });
    const id2 = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    await db.publishAnnouncement(id2, 'imported');
    expect(await db.claimOutbox(10, 1)).toHaveLength(0);
  });

  it('counts emails being sent toward the daily limit', async () => {
    const id = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    for (const e of ['a@x.co', 'b@x.co', 'c@x.co'])
      db.contacts.push({ name: 'A', email: e, source: 'S' });
    await db.publishAnnouncement(id, 'imported');
    const claimed = await db.claimOutbox(2, 2);
    expect(claimed).toHaveLength(2);
    expect(await db.claimOutbox(2, 2)).toHaveLength(0);
    // An email being sent counts as well as one only claimed.
    expect(await db.beginOutbox(claimed[0]!.id, claimed[0]!.claimToken)).toBe(true);
    expect(await db.claimOutbox(2, 2)).toHaveLength(0);
  });

  const fresh = async (emails: string[]) => {
    const id = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    for (const e of emails) db.contacts.push({ name: 'A', email: e, source: 'Sheet' });
    await db.publishAnnouncement(id, 'imported');
    return id;
  };

  it('sends the email as published, even after the published event is edited', async () => {
    const id = await fresh(['a@x.co', 'b@x.co']);
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 1, dailyLimit: 99 });
    // The organiser edits the event for the home page before the rest of the list goes out.
    await db.updateAnnouncement(id, {
      ...ANN,
      title: 'Edited title',
      subject: 'Edited subject',
      message: 'Edited message',
      endDate: null,
      time: null,
      theme: null,
      imageUrl: null,
      linkUrl: null,
      linkLabel: null,
    });
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 1, dailyLimit: 99 });
    expect(mailer.sent.map((m) => m.subject)).toEqual([ANN.subject, ANN.subject]);
    expect(mailer.sent[1]?.text).not.toContain('Edited');
    expect((await db.announcementById(id))?.title).toBe('Edited title');
  });

  it('waits for the mail quota without using attempts, and stops the batch', async () => {
    await fresh(['a@x.co', 'b@x.co', 'c@x.co']);
    let calls = 0;
    const full = {
      kind: 'full',
      send: () => {
        calls++;
        return Promise.reject(Object.assign(new Error('quota'), { status: 429 }));
      },
      isQuota: () => true,
      canRetry: () => true,
    };
    for (let i = 0; i < 5; i++)
      await processOutbox({
        db,
        mailer: full,
        siteUrl: 'https://jp.test',
        limit: 10,
        dailyLimit: 99,
      });
    // One try per run, then the batch stops; nothing used an attempt or failed.
    expect(calls).toBe(5);
    expect(db.outbox.every((o) => o.status === 'pending' && o.attempts === 0)).toBe(true);
    // Once the quota resets, they all go out.
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 10, dailyLimit: 99 });
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['a@x.co', 'b@x.co', 'c@x.co']);
  });

  it('starts no email after its time budget, and claims one at a time', async () => {
    await fresh(['a@x.co', 'b@x.co']);
    expect(
      await processOutbox({
        db,
        mailer,
        siteUrl: 'https://jp.test',
        limit: 10,
        dailyLimit: 99,
        timeBudgetMs: 0,
      }),
    ).toEqual({ sent: 0, failed: 0 });
    expect(db.outbox.every((o) => o.status === 'pending')).toBe(true);
    const claims: number[] = [];
    const claim = db.claimOutbox.bind(db);
    db.claimOutbox = async (n, d) => {
      claims.push(n);
      return claim(n, d);
    };
    await processOutbox({
      db,
      mailer,
      siteUrl: 'https://jp.test',
      limit: 10,
      dailyLimit: 99,
      timeBudgetMs: 60_000,
    });
    expect(claims.every((n) => n === 1)).toBe(true);
    expect(mailer.sent).toHaveLength(2);
  });

  it('counts emails closed without delivery, so a finished run reads as finished', async () => {
    const id = await fresh(['a@x.co', 'b@x.co', 'c@x.co']);
    // b unsubscribes after publishing; c's send is refused for good.
    const b = db.outbox.find((o) => o.email === 'b@x.co');
    await db.unsubscribe(b?.unsubToken ?? '');
    const picky = {
      kind: 'picky',
      send: async (m: { to: string }) => {
        if (m.to === 'c@x.co') throw new Error('mailbox does not exist');
        await mailer.send(m as Parameters<MemoryMailer['send']>[0]);
      },
      canRetry: () => false,
    };
    await processOutbox({
      db,
      mailer: picky,
      siteUrl: 'https://jp.test',
      limit: 10,
      dailyLimit: 99,
    });
    const a = await db.announcementById(id);
    expect(a?.recipients).toBe(3);
    expect(a?.sentCount).toBe(1);
    expect(a?.unsentCount).toBe(2);
    expect((await db.listAnnouncements()).find((x) => x.id === id)?.unsentCount).toBe(2);
  });

  it('does not send an email when starting it ran past the time budget', async () => {
    await fresh(['a@x.co']);
    let clock = 1_000_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      // Switching the email to "sending" is slow: it ends after the 100 ms budget.
      const begin = db.beginOutbox.bind(db);
      db.beginOutbox = async (id, token) => {
        clock += 200;
        return begin(id, token);
      };
      expect(
        await processOutbox({
          db,
          mailer,
          siteUrl: 'https://jp.test',
          limit: 10,
          dailyLimit: 99,
          timeBudgetMs: 100,
        }),
      ).toEqual({ sent: 0, failed: 0 });
    } finally {
      now.mockRestore();
    }
    expect(mailer.sent).toHaveLength(0);
    expect(db.outbox.every((o) => o.status === 'pending' && o.attempts === 0)).toBe(true);
  });

  it('does not start an email whose preparation ran past the time budget', async () => {
    await fresh(['a@x.co', 'b@x.co']);
    let clock = 1_000_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      // The announcement lookup is slow: it ends after the 100 ms budget.
      const begin = vi.spyOn(db, 'beginOutbox');
      const lookup = db.announcementById.bind(db);
      db.announcementById = async (id) => {
        clock += 200;
        return lookup(id);
      };
      expect(
        await processOutbox({
          db,
          mailer,
          siteUrl: 'https://jp.test',
          limit: 10,
          dailyLimit: 99,
          timeBudgetMs: 100,
        }),
      ).toEqual({ sent: 0, failed: 0 });
      // Caught before sending even started, not only by the check after it.
      expect(begin).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
    // Nothing went out, and the email waits for the next run without using an attempt.
    expect(mailer.sent).toHaveLength(0);
    expect(db.outbox.every((o) => o.status === 'pending' && o.attempts === 0)).toBe(true);
  });

  it('keeps an event that starts today ahead of newer ones already under way', async () => {
    const base = {
      ...ANN,
      time: null,
      theme: null,
      imageUrl: null,
      linkUrl: null,
      linkLabel: null,
    };
    const make = async (date: string, endDate: string | null) => {
      const a = await db.createAnnouncement({ ...base, date, endDate });
      db.contacts.push({ name: 'A', email: `q${a.id}@x.co`, source: 'S' });
      await db.publishAnnouncement(a.id, 'imported');
      return a.id;
    };
    const today = await make('2027-01-05', null);
    const running = [
      await make('2027-01-01', '2027-01-10'),
      await make('2027-01-02', '2027-01-10'),
      await make('2027-01-03', '2027-01-10'),
    ];
    const ids = (await db.upcomingAnnouncements('2027-01-05', 3)).map((a) => a.id);
    expect(ids).toEqual([today, running[2], running[1]]);
  });

  it('lists an event already under way as starting today, newest first on the same day', async () => {
    const base = {
      ...ANN,
      time: null,
      theme: null,
      imageUrl: null,
      linkUrl: null,
      linkLabel: null,
    };
    const make = async (date: string, endDate: string | null) => {
      const a = await db.createAnnouncement({ ...base, date, endDate });
      db.contacts.push({ name: 'A', email: `p${a.id}@x.co`, source: 'S' });
      await db.publishAnnouncement(a.id, 'imported');
      return a.id;
    };
    const running = await make('2027-01-01', '2027-01-10');
    const later = await make('2027-01-08', null);
    const today = await make('2027-01-05', null);
    const ids = (await db.upcomingAnnouncements('2027-01-05', 3)).map((a) => a.id);
    expect(ids).toEqual([today, running, later]);
  });

  it('gives back a claim that stalled before sending, and never lets the stalled run send', async () => {
    await fresh(['a@x.co']);
    // Run 1 claims the email, then stalls (say, a slow lookup) before sending it.
    const [stalled] = await db.claimOutbox(1, 99);
    expect(db.outbox[0]).toMatchObject({ status: 'claimed', attempts: 0 });
    db.outbox[0]!.claimedAt -= 11 * 60_000;
    // Run 2, ten minutes later: the claim goes back in the queue unharmed and is sent once.
    await processOutbox({ db, mailer, siteUrl: 'https://jp.test', limit: 10, dailyLimit: 99 });
    expect(mailer.sent).toHaveLength(1);
    expect(db.outbox[0]).toMatchObject({ status: 'sent', attempts: 1 });
    // Run 1 wakes up: its claim is gone, so it may not start sending.
    expect(await db.beginOutbox(stalled!.id, stalled!.claimToken)).toBe(false);
  });

  it('never lets a run whose claim expired change an email another run is sending', async () => {
    await fresh(['a@x.co']);
    const [stale] = await db.claimOutbox(1, 99);
    db.outbox[0]!.claimedAt -= 11 * 60_000;
    // Another run reclaims it and starts sending.
    const [fresh2] = await db.claimOutbox(1, 99);
    expect(await db.beginOutbox(fresh2!.id, fresh2!.claimToken)).toBe(true);
    // The stale run's lookup fails and it tries to put the email back in the queue: no effect.
    await db.finishOutbox(stale!.id, stale!.claimToken, 'retry', 'lookup failed');
    expect(db.outbox[0]).toMatchObject({ status: 'sending', attempts: 0 });
    // The run that holds the claim records the result.
    await db.finishOutbox(fresh2!.id, fresh2!.claimToken, 'sent');
    expect(db.outbox[0]?.status).toBe('sent');
  });

  it('refuses to start an expired claim even before another run has reclaimed it', async () => {
    await fresh(['a@x.co']);
    const [old] = await db.claimOutbox(1, 99);
    db.outbox[0]!.claimedAt -= 11 * 60_000;
    // No other run has tidied up yet, but the lease is over.
    expect(await db.beginOutbox(old!.id, old!.claimToken)).toBe(false);
    expect(db.outbox[0]?.status).toBe('claimed');
    // A fresh claim starts as usual.
    const [renewed] = await db.claimOutbox(1, 99);
    expect(await db.beginOutbox(renewed!.id, renewed!.claimToken)).toBe(true);
  });

  it('counts each address once when the same email is imported twice', async () => {
    db.unsubscribed.add('gone@x.co');
    expect(
      await db.importContacts(
        [
          { name: 'A', email: 'new@x.co' },
          { name: 'A again', email: 'new@x.co' },
          { name: 'G', email: 'gone@x.co' },
          { name: 'G again', email: 'gone@x.co' },
        ],
        'Sheet',
      ),
    ).toEqual({ added: 1, existing: 0, unsubscribed: 1 });
  });

  it('lets only the run holding the claim start sending', async () => {
    await fresh(['a@x.co']);
    const [item] = await db.claimOutbox(1, 99);
    expect(await db.beginOutbox(item!.id, 'someone-else')).toBe(false);
    expect(await db.beginOutbox(item!.id, item!.claimToken)).toBe(true);
    expect(await db.beginOutbox(item!.id, item!.claimToken)).toBe(false);
  });

  it('publishes once when two publishes run at the same time', async () => {
    const id = (
      await db.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    db.contacts.push({ name: 'A', email: 'a@x.co', source: 'Sheet' });
    const [one, two] = await Promise.all([
      db.publishAnnouncement(id, 'imported'),
      db.publishAnnouncement(id, 'imported'),
    ]);
    expect([one, two].filter(Boolean)).toHaveLength(1);
    expect(db.outbox).toHaveLength(1);
  });

  it('updates only the editable fields, never the status or counts', async () => {
    const draft = await db.createAnnouncement({
      ...ANN,
      endDate: null,
      time: null,
      theme: null,
      imageUrl: null,
      linkUrl: null,
      linkLabel: null,
    });
    db.contacts.push({ name: 'A', email: 'a@x.co', source: 'Sheet' });
    await db.publishAnnouncement(draft.id, 'imported');
    // A caller passing back the old draft record, with a new title.
    const updated = await db.updateAnnouncement(draft.id, { ...draft, title: 'New title' });
    expect(updated).toMatchObject({ title: 'New title', status: 'published', recipients: 1 });
    expect(await db.publishAnnouncement(draft.id, 'imported')).toBeNull();
    expect(db.outbox).toHaveLength(1);
  });

  it('leaves nothing queued when publishing fails part-way, so a retry queues each person once', async () => {
    let broken = false;
    const local = new MemoryDb(EVENT, () => {
      if (broken) throw new Error('clock unavailable');
      return new Date();
    });
    const id = (
      await local.createAnnouncement({
        ...ANN,
        endDate: null,
        time: null,
        theme: null,
        imageUrl: null,
        linkUrl: null,
        linkLabel: null,
      })
    ).id;
    local.contacts.push(
      { name: 'A', email: 'a@x.co', source: 'Sheet' },
      { name: 'B', email: 'b@x.co', source: 'Sheet' },
    );
    broken = true;
    await expect(local.publishAnnouncement(id, 'imported')).rejects.toThrow('clock unavailable');
    broken = false;
    // Still a draft, with nothing queued that could be sent.
    expect((await local.announcementById(id))?.status).toBe('draft');
    expect(local.outbox).toHaveLength(0);
    // Publishing again works, and queues each person exactly once.
    expect((await local.publishAnnouncement(id, 'imported'))?.recipients).toBe(2);
    expect(local.outbox.map((o) => o.email).sort()).toEqual(['a@x.co', 'b@x.co']);
  });

  it('still serves the gathering when the announcements query fails', async () => {
    db.upcomingAnnouncements = () => Promise.reject(new Error('no table yet'));
    const { status, data } = await call('GET', '/api/public', undefined, { cookie: '' });
    expect(status).toBe(200);
    expect(data.event).toMatchObject({ title: 'Just Pray' });
    // null, not [], so a page that already shows events keeps them.
    expect(data.upcoming).toBeNull();
  });
});
