import { beforeEach, describe, expect, it } from 'vitest';
import { handleApi, type ApiDeps } from '../../server/api';
import { createSession } from '../../server/auth';
import { MemoryMailer } from '../../server/mailer';
import { MemoryDb } from '../../server/memory-db';
import { processOutbox } from '../../server/outbox';
import { parseCsv, rowsToContacts } from '../../src/lib/contacts';

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
    expect(data).toEqual({ added: 1, existing: 1, unsubscribed: 1, invalid: 1 });
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
    expect(data.counts).toEqual({ all: 2, booked: 1, imported: 1 });
  });

  it.each([
    ['booked', ['booked@example.com']],
    ['imported', ['imp@example.com']],
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
    const broken = { kind: 'broken', send: () => Promise.reject(new Error('smtp')) };
    for (let i = 0; i < 4; i++)
      await processOutbox({
        db,
        mailer: broken,
        siteUrl: 'https://jp.test',
        limit: 20,
        dailyLimit: 99,
      });
    expect(db.outbox.filter((o) => o.status === 'failed')).toHaveLength(1);
    expect((await db.announcementById(id))?.sentCount).toBe(1);
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
    expect((await call('GET', '/api/admin/announcements')).data.counts.imported).toBe(0);
    expect(
      (await call('POST', '/api/preferences', { token, action: 'resubscribe' })).data,
    ).toMatchObject({
      subscribed: true,
    });
    expect((await call('GET', '/api/admin/announcements')).data.counts.imported).toBe(1);
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
