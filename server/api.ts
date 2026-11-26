import { createHash, randomBytes, randomInt } from 'node:crypto';
import { icsFile } from '../src/lib/calendar';
import { parseTime, startsAt } from '../src/lib/format';
import { fieldsOf, validateContribution, validateRegistration } from '../src/lib/validation';
import {
  clearedCookie,
  createSession,
  passwordMatches,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  sessionIsValid,
} from './auth';
import { announcementEmail, cancelledEmail, reservationEmail } from './emails';
import { processOutbox } from './outbox';
import {
  CONTRIBUTION_STATUSES,
  type BankDetails,
  type Banks,
  type ContributionRecord,
  AUDIENCE_SCOPES,
  type AnnouncementFields,
  type AnnouncementRecord,
  type AudienceScope,
  type ContributionStatus,
  type Db,
  type EventDetails,
  type Mailer,
  type ReservationRecord,
} from './types';

export interface ApiDeps {
  /** Null when the database is not configured; every data route then returns 503. */
  db: Db | null;
  /** Null when email is not configured; reservations still work. */
  mailer: Mailer | null;
  /** Empty disables the organiser area. */
  adminPassword: string;
  banks: Banks;
  /** Run work after the response is sent (Netlify's `context.waitUntil`). */
  defer: (work: Promise<unknown>) => void;
  /** The public address used in email links. Defaults to the production site, except when the
   *  request comes from this computer (local development), where links point back to it. */
  siteUrl?: string;
  log?: (message: string, error?: unknown) => void;
  /** Delay after a wrong organiser password, to slow down guessing. */
  failedLoginDelayMs?: number;
  /** Where "Send a test to me" goes by default (the organisers' inbox). */
  testEmail?: string;
  /** Most announcement emails to send in 24 hours, to stay within the mail service's limit. */
  dailyLimit?: number;
}

const MAX_BODY = 10_000;
/** Imports can be larger: about 5,000 people. */
/** Room for 5,000 people with the longest names (120) and emails (254) the import keeps, with
 *  JSON quoting and escapes to spare. */
const MAX_IMPORT_BODY = 2_500_000;
const MAX_IMPORT = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PRODUCTION_URL = 'https://justprayy.netlify.app';
/** Announcement emails per 24 hours. Gmail allows about 500 a day in all; this leaves room for
 *  seat confirmations. Set ANNOUNCE_DAILY_LIMIT to change it (e.g. after moving to Resend). */
export const DAILY_LIMIT = 350;
/** How long a gathering stays open for cancelling after it starts. */
const CANCEL_GRACE_MS = 60 * 60 * 1000;
const REF_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SERVER_ERROR = 'Something went wrong on our side. Please try again in a moment.';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

const fail = (status: number, error: string): Response => json(status, { error });

async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json'))
    throw new HttpError(415, 'Send JSON.');
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'Request is too large.');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, 'Request is not valid JSON.');
  }
}

/** Like readJson, with room for an imported list. */
async function readImport(req: Request): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json'))
    throw new HttpError(415, 'Send JSON.');
  const raw = await req.text();
  if (raw.length > MAX_IMPORT_BODY)
    throw new HttpError(413, 'The list is too large to import at once.');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, 'Request is not valid JSON.');
  }
}

const field = (body: unknown, name: string): unknown =>
  body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined;

/** Hidden form field that people never fill in but simple bots do. */
const isBot = (body: unknown): boolean => {
  const v = field(body, 'website');
  return typeof v === 'string' && v.trim() !== '';
};

/** A private token for the "Cancel my seat" link, and the hash that is stored instead of it. */
export const newCancelToken = (): string => randomBytes(24).toString('base64url');
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export const newReference = (): string =>
  'JP-' + Array.from({ length: 5 }, () => REF_CHARS[randomInt(REF_CHARS.length)]).join('');

/** YYYY-MM-DD in Lagos time. */
const lagosDay = (iso: string | Date): string =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

/** Reservations per day for the last `days` days, oldest first. */
export function reservationsByDay(
  list: ReservationRecord[],
  now: Date,
  days = 7,
): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of list)
    counts.set(lagosDay(r.createdAt), (counts.get(lagosDay(r.createdAt)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const date = lagosDay(new Date(now.getTime() - (days - 1 - i) * 86_400_000));
    return { date, count: counts.get(date) ?? 0 };
  });
}

export function contributionTotals(list: ContributionRecord[]) {
  const confirmed = list.filter((c) => c.status === 'confirmed');
  const pending = list.filter((c) => c.status === 'pending' && c.markedSentAt);
  const sum = (xs: ContributionRecord[]) => ({
    NGN: xs.filter((c) => c.currency === 'NGN').reduce((t, c) => t + c.amount, 0),
    USD: xs.filter((c) => c.currency === 'USD').reduce((t, c) => t + c.amount, 0),
  });
  return {
    confirmed: sum(confirmed),
    confirmedCount: confirmed.length,
    supporters: new Set(confirmed.map((c) => c.email)).size,
    pending: sum(pending),
    pendingCount: pending.length,
  };
}

/** Quote a CSV cell, and stop spreadsheets from treating it as a formula. */
export const csvCell = (v: unknown): string => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

function validEvent(body: unknown, reserved: number): EventDetails {
  const str = (k: string): string => {
    const v = field(body, k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const event = {
    title: str('title'),
    date: str('date'),
    time: parseTime(str('time')) ?? '',
    venue: str('venue'),
    capacity: Number(field(body, 'capacity')),
  };
  if (!event.title || !event.venue) throw new HttpError(400, 'Fill in the title and venue.');
  if (!event.time) throw new HttpError(400, 'Choose a start time.');
  if (event.title.length > 200 || event.time.length > 100 || event.venue.length > 300)
    throw new HttpError(400, 'One of the fields is too long.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date) || Number.isNaN(Date.parse(event.date)))
    throw new HttpError(400, 'Enter a valid date.');
  if (!Number.isInteger(event.capacity) || event.capacity < 1 || event.capacity > 10000)
    throw new HttpError(400, 'Capacity must be a whole number between 1 and 10,000.');
  if (event.capacity < reserved)
    throw new HttpError(400, `Capacity cannot be below the ${reserved} seats already reserved.`);
  return event;
}

/** A public https link (or this computer, during local development). */
const httpsUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
  } catch {
    return false;
  }
};

/** Check an announcement from the organiser form; throws a 400 with a message to show. */
export function validAnnouncement(body: unknown): AnnouncementFields {
  const str = (k: string): string => {
    const v = field(body, k);
    return typeof v === 'string' ? v.trim() : '';
  };
  const orNull = (v: string): string | null => v || null;
  const f: AnnouncementFields = {
    title: str('title'),
    date: str('date'),
    endDate: orNull(str('endDate')),
    time: str('time') ? parseTime(str('time')) : null,
    theme: orNull(str('theme')),
    themeTba: field(body, 'themeTba') === true,
    venue: str('venue'),
    venueTba: field(body, 'venueTba') === true,
    summary: str('summary'),
    imageUrl: orNull(str('imageUrl')),
    linkUrl: orNull(str('linkUrl')),
    linkLabel: orNull(str('linkLabel')),
    subject: str('subject'),
    message: str('message'),
  };
  // A real calendar day: the parsed date must give back the same year, month and day, so an
  // overflow such as 2027-02-30 (which would roll into March) is refused.
  const isDate = (d: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const t = Date.parse(`${d}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
  };
  if (!f.title || !f.summary || !f.subject || !f.message)
    throw new HttpError(400, 'Fill in the title, summary, subject and message.');
  if (!f.venue && !f.venueTba)
    throw new HttpError(400, 'Fill in the venue, or tick “Venue to be announced”.');
  if (f.themeTba) f.theme = null;
  if (!isDate(f.date)) throw new HttpError(400, 'Enter the event date.');
  if (f.endDate && (!isDate(f.endDate) || f.endDate < f.date))
    throw new HttpError(400, 'The end date must be on or after the start date.');
  if (str('time') && !f.time) throw new HttpError(400, 'Enter the start time with the picker.');
  if (f.imageUrl && !httpsUrl(f.imageUrl))
    throw new HttpError(400, 'The picture link must start with https://');
  if (f.linkUrl && !httpsUrl(f.linkUrl))
    throw new HttpError(400, 'The button link must start with https://');
  type TextField = 'title' | 'theme' | 'venue' | 'summary' | 'linkLabel' | 'subject' | 'message';
  const limits: [TextField, number][] = [
    ['title', 120],
    ['theme', 160],
    ['venue', 200],
    ['summary', 280],
    ['linkLabel', 40],
    ['subject', 150],
    ['message', 5000],
  ];
  for (const [k, max] of limits)
    if ((f[k] ?? '').length > max) throw new HttpError(400, `The ${k} is too long.`);
  return f;
}

/** The stored fields in the shape the email template takes. */
export const toContent = (f: AnnouncementFields) => ({
  ...f,
  endDate: f.endDate ?? undefined,
  time: f.time ?? undefined,
  theme: f.theme ?? undefined,
  imageUrl: f.imageUrl ?? undefined,
  linkUrl: f.linkUrl ?? undefined,
  linkLabel: f.linkLabel ?? undefined,
});

/** "adaobi@example.com" -> "ad•••@example.com": enough to recognise, not to read off a screen. */
export const maskEmail = (email: string): string => {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, Math.min(2, Math.max(1, user.length - 1)))}•••@${domain}`;
};

/** What the public site shows of an announcement. */
const publicAnnouncement = (a: AnnouncementRecord) => ({
  id: a.id,
  title: a.title,
  date: a.date,
  endDate: a.endDate,
  time: a.time,
  theme: a.theme,
  themeTba: a.themeTba,
  venue: a.venue,
  venueTba: a.venueTba,
  summary: a.summary,
  imageUrl: a.imageUrl,
  linkUrl: a.linkUrl,
  linkLabel: a.linkLabel,
});

const publicReservation = (r: ReservationRecord) => ({
  seat: r.seat,
  code: r.code,
  name: r.name,
  email: r.email,
  phone: r.phone,
  updates: r.updates,
  emailSent: r.emailSentAt !== null,
  createdAt: r.createdAt,
  status: r.status,
  cancelledAt: r.cancelledAt,
});

const isLocal = (url: URL): boolean => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);

/** Handle one `/api/*` request. Framework-free so it runs on Netlify, in Vite and in tests. */
export async function handleApi(req: Request, deps: ApiDeps): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method.toUpperCase();
  const secure = url.protocol === 'https:';
  const log = deps.log ?? ((m: string, e?: unknown) => console.error(m, e ?? ''));
  // Deploy previews share the production database, so their emails link to the real site.
  const siteUrl = (deps.siteUrl || (isLocal(url) ? url.origin : PRODUCTION_URL)).replace(
    /\/+$/,
    '',
  );
  const cancelUrl = (token: string): string => `${siteUrl}/#/cancel/${token}`;

  const db = (): Db => {
    if (!deps.db) throw new HttpError(503, 'The site is not connected to its database yet.');
    return deps.db;
  };

  const isAdmin = (): boolean =>
    sessionIsValid(readCookie(req.headers.get('cookie'), SESSION_COOKIE), deps.adminPassword);

  const requireAdmin = (): void => {
    if (!deps.adminPassword) throw new HttpError(503, 'The organiser area is not set up yet.');
    if (!isAdmin()) throw new HttpError(401, 'Please sign in.');
  };

  const sendLater = (label: string, work: (mailer: Mailer) => Promise<void>): boolean => {
    if (!deps.mailer) return false;
    const mailer = deps.mailer;
    deps.defer(
      (async () => {
        try {
          await work(mailer);
        } catch (e) {
          log(`${label} failed (${mailer.kind})`, e);
        }
      })(),
    );
    return true;
  };

  const sendConfirmation = (
    held: { id: number; seat: number; code: string },
    name: string,
    email: string,
    event: EventDetails,
    eventId: number | null,
    cancelToken: string,
  ): boolean =>
    sendLater(`Confirmation email for ${held.code}`, async (mailer) => {
      const { seat, code } = held;
      const link = cancelUrl(cancelToken);
      const hash = hashToken(cancelToken);
      try {
        await mailer.send(
          reservationEmail({ name, email, seat, code, event, eventId, siteUrl, cancelUrl: link }),
        );
      } catch (e) {
        // Only a failure that is recorded lets a later booking attempt re-send the email (with a
        // new cancel link). Record it only when the mail service certainly did not take the email:
        // after a timeout or an aborted send it may already be in the inbox, and a second copy
        // would carry a different cancel link. Those stay unrecorded, so they are never re-sent.
        if (mailer.canRetry ? mailer.canRetry(e) : true)
          await db()
            .markEmailFailed(held.id, hash)
            .catch(() => undefined);
        throw e;
      }
      // Tied to this email's token: if the seat was cancelled and booked again meanwhile, the
      // newer booking's own email decides whether it was delivered.
      await db().markEmailSent(held.id, hash);
    });

  /** Find the reservation behind a cancel link, and whether it can still be cancelled. */
  const lookUpCancel = async (body: unknown) => {
    const token = field(body, 'token');
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
    const hash = hashToken(token);
    const found = await db().findByCancelHash(hash);
    if (!found) return null;
    const start = startsAt(found.event.date, found.event.time);
    const endOfDay = new Date(`${found.event.date}T23:59:59+01:00`).getTime();
    const closesAt = start ? start.getTime() + CANCEL_GRACE_MS : endOfDay;
    const ended = !found.current || Date.now() > closesAt;
    return { ...found, hash, ended };
  };

  const cancelView = (found: NonNullable<Awaited<ReturnType<typeof lookUpCancel>>>) => ({
    status:
      found.reservation.status === 'cancelled' ? 'cancelled' : found.ended ? 'ended' : 'active',
    seat: found.reservation.seat,
    code: found.reservation.code,
    name: found.reservation.name,
    event: {
      title: found.event.title,
      date: found.event.date,
      time: found.event.time,
      venue: found.event.venue,
    },
  });

  const BAD_LINK = 'This cancel link isn’t working. It may be from an older email.';

  try {
    // Public ------------------------------------------------------------------
    if (path === '/api/public' && method === 'GET') {
      const [event, reserved, upcoming] = await Promise.all([
        db().currentEvent(),
        db().reservedCount(),
        // Optional extra: if it fails, the gathering and seat count still load.
        db()
          .upcomingAnnouncements(lagosDay(new Date()), 3)
          .catch((e: unknown) => {
            log('Could not load upcoming announcements', e);
            return null;
          }),
      ]);
      return json(200, {
        event,
        reserved,
        banks: deps.banks,
        // null (not []) when the list could not be read, so a page that has it keeps it.
        upcoming: upcoming ? upcoming.map(publicAnnouncement) : null,
      });
    }

    if (path === '/api/reserve' && method === 'POST') {
      const body = await readJson(req);
      if (isBot(body)) return fail(400, 'Please try again.');
      const result = validateRegistration(fieldsOf(body));
      if (!result.ok) return json(400, { error: 'Please check the form.', fields: result.errors });
      const { name, email, phone, updates } = result.value;
      const [event, eventId] = await Promise.all([db().currentEvent(), db().currentEventId()]);
      if (!event) return fail(503, 'Reservations are not open yet. Please check back soon.');
      const cancelToken = newCancelToken();
      const outcome = await db().reserve({
        name,
        email,
        phone,
        updates,
        cancelHash: hashToken(cancelToken),
      });
      if (outcome.status === 'no_event')
        return fail(503, 'Reservations are not open yet. Please check back soon.');
      if (outcome.status === 'full')
        return json(409, { status: 'full', reserved: outcome.reserved, capacity: event.capacity });
      if (outcome.status === 'existing') {
        // Never echo someone else's details back. Re-send only a confirmation that is known to
        // have failed (not one still on its way), with a fresh cancel link: the earlier link never
        // reached the inbox. The claim is atomic, so two attempts at once send one email.
        let emailQueued = false;
        if (outcome.emailSentAt === null && deps.mailer) {
          const fresh = newCancelToken();
          if (await db().claimEmailRetry(outcome.id, hashToken(fresh)))
            emailQueued = sendConfirmation(outcome, name, email, event, eventId, fresh);
        }
        return json(200, {
          status: 'existing',
          reserved: outcome.reserved,
          capacity: event.capacity,
          emailQueued,
        });
      }
      const emailQueued = sendConfirmation(outcome, name, email, event, eventId, cancelToken);
      // With email off, record the confirmation as not sent, so that once email is set up a
      // repeat booking attempt sends it (with a fresh cancel link), as for a failed send.
      // The seat is taken either way: a failure here must not lose the visitor their pass.
      if (!emailQueued)
        await db()
          .markEmailFailed(outcome.id, hashToken(cancelToken))
          .catch((e: unknown) => log(`Could not mark ${outcome.code} as not emailed`, e));
      return json(201, {
        status: 'created',
        reservation: { seat: outcome.seat, code: outcome.code, name, email, phone, cancelToken },
        reserved: outcome.reserved,
        capacity: event.capacity,
        emailQueued,
      });
    }

    if (path === '/api/event.ics' && method === 'GET') {
      // Emails name their gathering by its record id, so an older email keeps giving its own
      // gathering, with its latest details (a new date if it was moved), whatever is current.
      const id = url.searchParams.get('event') ?? '';
      const event = /^\d{1,12}$/.test(id)
        ? await db().eventById(Number(id))
        : await db().currentEvent();
      if (!event) return fail(404, 'That gathering is not listed any more.');
      return new Response(icsFile(event, siteUrl), {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="just-pray.ics"',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (path === '/api/cancel/lookup' && method === 'POST') {
      const found = await lookUpCancel(await readJson(req));
      if (!found) return fail(404, BAD_LINK);
      return json(200, cancelView(found));
    }

    if (path === '/api/cancel' && method === 'POST') {
      const body = await readJson(req);
      const found = await lookUpCancel(body);
      if (!found) return fail(404, BAD_LINK);
      const r = found.reservation;
      if (
        r.status === 'active' &&
        !found.ended &&
        (await db().cancelReservation(r.id, found.hash))
      ) {
        sendLater(`Cancellation email for ${r.code}`, (mailer) =>
          mailer.send(
            cancelledEmail({
              name: r.name,
              email: r.email,
              seat: r.seat,
              code: r.code,
              event: found.event,
              siteUrl,
            }),
          ),
        );
        const view = cancelView({ ...found, reservation: { ...r, status: 'cancelled' } });
        return json(200, { ...view, reserved: await db().reservedCount() });
      }
      // Nothing changed: read the booking again rather than trust the earlier lookup. Already
      // cancelled (perhaps a moment ago, in another tab) or too late: say how things stand. The
      // link replaced meanwhile (cancelled and booked again): this link no longer works.
      const latest = await lookUpCancel(body);
      if (!latest) return fail(404, BAD_LINK);
      return json(200, cancelView(latest));
    }

    if (path === '/api/contributions' && method === 'POST') {
      const body = await readJson(req);
      if (isBot(body)) return fail(400, 'Please try again.');
      const result = validateContribution(fieldsOf(body));
      if (!result.ok) return fail(400, result.errors);
      const bank = deps.banks[result.value.currency];
      if (!bank)
        return fail(
          503,
          result.value.currency === 'USD'
            ? 'Dollar transfers are not set up yet. Please give in naira, or check back soon.'
            : 'Bank details are not set up yet. Please check back soon.',
        );
      for (let attempt = 0; attempt < 5; attempt++) {
        const created = await db().createContribution({
          reference: newReference(),
          ...result.value,
        });
        if (created)
          return json(201, {
            reference: created.reference,
            currency: created.currency,
            amount: created.amount,
            bank,
          });
      }
      throw new Error('Could not create a unique contribution reference');
    }

    if (path === '/api/contributions/sent' && method === 'POST') {
      const body = await readJson(req);
      const reference = field(body, 'reference');
      if (typeof reference !== 'string' || !/^JP-[A-Z0-9]{5}$/.test(reference))
        return fail(400, 'Unknown reference.');
      const c = await db().markContributionSent(reference);
      if (!c) return fail(404, 'Unknown reference.');
      return json(200, {
        reference: c.reference,
        currency: c.currency,
        amount: c.amount,
        status: c.status,
      });
    }

    // Organisers --------------------------------------------------------------
    if (path === '/api/admin/login' && method === 'POST') {
      if (!deps.adminPassword) return fail(503, 'The organiser area is not set up yet.');
      const body = await readJson(req);
      if (!passwordMatches(field(body, 'password'), deps.adminPassword)) {
        await new Promise((r) => setTimeout(r, deps.failedLoginDelayMs ?? 600));
        return fail(401, 'That password is not right.');
      }
      return json(
        200,
        { ok: true },
        {
          'Set-Cookie': sessionCookie(createSession(deps.adminPassword), secure),
        },
      );
    }

    if (path === '/api/admin/logout' && method === 'POST') {
      return json(200, { ok: true }, { 'Set-Cookie': clearedCookie(secure) });
    }

    if (path === '/api/admin/data' && method === 'GET') {
      requireAdmin();
      const [event, reservations, contributions] = await Promise.all([
        db().currentEvent(),
        db().listReservations(),
        db().listContributions(),
      ]);
      // Seats still held. The chart counts them too, so it agrees with the seat total.
      const held = reservations.filter((r) => r.status === 'active');
      return json(200, {
        event,
        reserved: held.length,
        reservations: reservations.map(publicReservation),
        contributions,
        totals: contributionTotals(contributions),
        byDay: reservationsByDay(held, new Date()),
        email: deps.mailer ? deps.mailer.kind : null,
        banks: deps.banks,
      });
    }

    if (path === '/api/admin/event' && method === 'PUT') {
      requireAdmin();
      const body = await readJson(req);
      // Early, friendly check; the database makes the final decision under a lock.
      const event = validEvent(body, await db().reservedCount());
      const saved = await db().updateEvent(event);
      if (!saved.ok)
        return fail(400, `Capacity cannot be below the ${saved.reserved} seats already reserved.`);
      return json(200, { event: saved.event });
    }

    if (path === '/api/admin/announcements' && method === 'GET') {
      requireAdmin();
      const [announcements, all, booked, imported] = await Promise.all([
        db().listAnnouncements(),
        db().updatesAudience('all'),
        db().updatesAudience('booked'),
        db().updatesAudience('imported'),
      ]);
      return json(200, {
        announcements,
        audience: all.length,
        counts: { all: all.length, booked: booked.length, imported: imported.length },
        testTo: deps.testEmail ?? '',
        dailyLimit: deps.dailyLimit ?? DAILY_LIMIT,
        email: deps.mailer ? deps.mailer.kind : null,
      });
    }

    if (path === '/api/admin/audience' && method === 'GET') {
      requireAdmin();
      return json(200, { people: await db().updatesAudience('all') });
    }

    if (path === '/api/admin/contacts/import' && method === 'POST') {
      requireAdmin();
      const raw = await readImport(req);
      const label =
        String(field(raw, 'label') ?? '')
          .trim()
          .slice(0, 80) || 'Imported';
      const list = field(raw, 'people');
      if (!Array.isArray(list) || list.length === 0) return fail(400, 'No people to import.');
      if (list.length > MAX_IMPORT)
        return fail(400, `Import up to ${MAX_IMPORT.toLocaleString('en-GB')} people at a time.`);
      const seen = new Set<string>();
      const people: { name: string; email: string }[] = [];
      let invalid = 0;
      for (const p of list) {
        const email = String(field(p, 'email') ?? '')
          .trim()
          .toLowerCase();
        const name = String(field(p, 'name') ?? '')
          .trim()
          .slice(0, 120);
        if (!EMAIL_RE.test(email) || email.length > 254) invalid++;
        else if (!seen.has(email)) {
          seen.add(email);
          people.push({ name, email });
        }
      }
      if (!people.length) return fail(400, 'None of the rows has a valid email address.');
      const result = await db().importContacts(people, label);
      return json(200, { ...result, invalid });
    }

    if (path === '/api/admin/announcements/test' && method === 'POST') {
      requireAdmin();
      const body = await readJson(req);
      const fields = validAnnouncement(body);
      const to = String(field(body, 'to') ?? '').trim();
      if (!EMAIL_RE.test(to)) return fail(400, 'Enter an email address for the test.');
      if (!deps.mailer) return fail(503, 'Email is not set up yet, so no test can be sent.');
      const email = announcementEmail({
        announcement: toContent(fields),
        name: 'Organiser',
        email: to,
        siteUrl,
        unsubscribeUrl: `${siteUrl}/#/unsubscribe/test`,
      });
      try {
        await deps.mailer.send({ ...email, subject: `[Test] ${email.subject}` });
      } catch (e) {
        log('Test announcement failed', e);
        return fail(
          502,
          'The test email could not be sent. Check the email settings and try again.',
        );
      }
      return json(200, { ok: true });
    }

    // The email preferences page: who the link is for (partly hidden), and on/off.
    if (path === '/api/preferences' && method === 'POST') {
      const body = await readJson(req);
      const token = String(field(body, 'token') ?? '');
      const action = field(body, 'action');
      if (!TOKEN_RE.test(token)) return fail(404, 'This link isn’t working.');
      if (action === 'unsubscribe') await db().unsubscribe(token);
      else if (action === 'resubscribe') await db().resubscribe(token);
      const found = await db().subscriptionByToken(token);
      if (!found) return fail(404, 'This link isn’t working.');
      return json(200, { email: maskEmail(found.email), subscribed: found.subscribed });
    }

    if (path === '/api/unsubscribe' && method === 'POST') {
      // From the unsubscribe page (JSON) or a mail app's one-click button (?t=…, form body).
      let token = url.searchParams.get('t') ?? '';
      if (!token && (req.headers.get('content-type') ?? '').includes('application/json'))
        token = String(field(await readJson(req), 'token') ?? '');
      if (!TOKEN_RE.test(token)) return fail(404, 'This unsubscribe link isn’t working.');
      const email = await db().unsubscribe(token);
      if (!email) return fail(404, 'This unsubscribe link isn’t working.');
      return json(200, { ok: true });
    }

    if (path === '/api/admin/announcements' && method === 'POST') {
      requireAdmin();
      const created = await db().createAnnouncement(validAnnouncement(await readJson(req)));
      return json(201, { announcement: created });
    }

    const annMatch = /^\/api\/admin\/announcements\/(\d+)(\/publish)?$/.exec(path);
    if (annMatch) {
      requireAdmin();
      const id = Number(annMatch[1]);
      if (!annMatch[2] && method === 'PUT') {
        const saved = await db().updateAnnouncement(id, validAnnouncement(await readJson(req)));
        if (!saved) return fail(404, 'Announcement not found.');
        return json(200, { announcement: saved });
      }
      if (!annMatch[2] && method === 'DELETE') {
        if (!(await db().deleteDraftAnnouncement(id)))
          return fail(400, 'Only a draft can be deleted.');
        return json(200, { ok: true });
      }
      if (annMatch[2] && method === 'POST') {
        const scope = field(await readJson(req), 'audience');
        if (!AUDIENCE_SCOPES.includes(scope as AudienceScope))
          return fail(400, 'Choose who to send it to.');
        const published = await db().publishAnnouncement(id, scope as AudienceScope);
        if (!published) return fail(400, 'This announcement is already published.');
        // The emails are queued. Send a first batch now; the scheduled sender does the rest,
        // within the daily limit.
        if (deps.mailer) {
          const mailer = deps.mailer;
          deps.defer(
            processOutbox({
              db: db(),
              mailer,
              siteUrl,
              limit: 10,
              dailyLimit: deps.dailyLimit ?? DAILY_LIMIT,
              // Stay well inside the function's time limit; the scheduled sender does the rest.
              timeBudgetMs: 8_000,
              log,
            }).catch((e: unknown) => log('First announcement batch failed', e)),
          );
        }
        return json(200, { announcement: published });
      }
    }

    const statusMatch = /^\/api\/admin\/contributions\/(\d+)$/.exec(path);
    if (statusMatch && method === 'POST') {
      requireAdmin();
      const body = await readJson(req);
      const status = field(body, 'status');
      if (!CONTRIBUTION_STATUSES.includes(status as ContributionStatus))
        return fail(400, 'Unknown status.');
      const c = await db().setContributionStatus(
        Number(statusMatch[1]),
        status as ContributionStatus,
      );
      if (!c) return fail(404, 'Contribution not found.');
      return json(200, { contribution: c });
    }

    if (path === '/api/admin/reservations.csv' && method === 'GET') {
      requireAdmin();
      const list = await db().listReservations();
      const header = [
        'Seat',
        'Code',
        'Name',
        'Email',
        'WhatsApp',
        'Wants updates',
        'Email sent',
        'Reserved at',
        'Status',
      ];
      const rows = list.map((r) =>
        [
          r.seat,
          r.code,
          r.name,
          r.email,
          r.phone,
          r.updates ? 'yes' : 'no',
          r.emailSentAt ? 'yes' : 'no',
          r.createdAt,
          r.status === 'cancelled' ? 'cancelled' : 'reserved',
        ]
          .map(csvCell)
          .join(','),
      );
      return new Response([header.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="just-pray-reservations.csv"',
          'Cache-Control': 'no-store',
        },
      });
    }

    return fail(404, 'Not found.');
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    log(`API error on ${method} ${path}`, e);
    return fail(500, SERVER_ERROR);
  }
}

/** Build dependencies from environment variables (Netlify). */
export interface ApiEnv {
  BANK_NAME_NAIRA?: string;
  BANK_ACCOUNT_NAME_NAIRA?: string;
  BANK_ACCOUNT_NUMBER_NAIRA?: string;
  BANK_NAME_DOLLAR?: string;
  BANK_ACCOUNT_NAME_DOLLAR?: string;
  BANK_ACCOUNT_NUMBER_DOLLAR?: string;
  BANK_SWIFT_CODE_DOLLAR?: string;
  // Earlier names, still accepted.
  BANK_NAME?: string;
  BANK_ACCOUNT_NAME?: string;
  BANK_ACCOUNT_NUMBER?: string;
  USD_BANK_NAME?: string;
  USD_ACCOUNT_NAME?: string;
  USD_ACCOUNT_NUMBER?: string;
  USD_SWIFT_CODE?: string;
}

const account = (
  bankName?: string,
  accountName?: string,
  accountNumber?: string,
  swiftCode?: string,
): BankDetails | null =>
  bankName?.trim() && accountName?.trim() && accountNumber?.trim()
    ? {
        bankName: bankName.trim(),
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        ...(swiftCode?.trim() ? { swiftCode: swiftCode.trim() } : {}),
      }
    : null;

/** Naira account from BANK_*_NAIRA, dollar account from BANK_*_DOLLAR (earlier names also work). */
export const banksFromEnv = (env: ApiEnv): Banks => ({
  NGN: account(
    env.BANK_NAME_NAIRA || env.BANK_NAME,
    env.BANK_ACCOUNT_NAME_NAIRA || env.BANK_ACCOUNT_NAME,
    env.BANK_ACCOUNT_NUMBER_NAIRA || env.BANK_ACCOUNT_NUMBER,
  ),
  USD: account(
    env.BANK_NAME_DOLLAR || env.USD_BANK_NAME,
    env.BANK_ACCOUNT_NAME_DOLLAR || env.USD_ACCOUNT_NAME,
    env.BANK_ACCOUNT_NUMBER_DOLLAR || env.USD_ACCOUNT_NUMBER,
    env.BANK_SWIFT_CODE_DOLLAR || env.USD_SWIFT_CODE,
  ),
});
