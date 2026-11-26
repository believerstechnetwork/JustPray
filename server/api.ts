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
import { cancelledEmail, reservationEmail } from './emails';
import {
  CONTRIBUTION_STATUSES,
  type BankDetails,
  type Banks,
  type ContributionRecord,
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
}

const MAX_BODY = 10_000;
export const PRODUCTION_URL = 'https://justprayy.netlify.app';
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
    cancelToken: string,
  ): boolean =>
    sendLater(`Confirmation email for ${held.code}`, async (mailer) => {
      const { seat, code } = held;
      const link = cancelUrl(cancelToken);
      const hash = hashToken(cancelToken);
      try {
        await mailer.send(
          reservationEmail({ name, email, seat, code, event, siteUrl, cancelUrl: link }),
        );
      } catch (e) {
        // Only a failure that is recorded lets a later booking attempt re-send the email.
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
      const [event, reserved] = await Promise.all([db().currentEvent(), db().reservedCount()]);
      return json(200, { event, reserved, banks: deps.banks });
    }

    if (path === '/api/reserve' && method === 'POST') {
      const body = await readJson(req);
      if (isBot(body)) return fail(400, 'Please try again.');
      const result = validateRegistration(fieldsOf(body));
      if (!result.ok) return json(400, { error: 'Please check the form.', fields: result.errors });
      const { name, email, phone, updates } = result.value;
      const event = await db().currentEvent();
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
            emailQueued = sendConfirmation(outcome, name, email, event, fresh);
        }
        return json(200, {
          status: 'existing',
          reserved: outcome.reserved,
          capacity: event.capacity,
          emailQueued,
        });
      }
      const emailQueued = sendConfirmation(outcome, name, email, event, cancelToken);
      return json(201, {
        status: 'created',
        reservation: { seat: outcome.seat, code: outcome.code, name, email, phone, cancelToken },
        reserved: outcome.reserved,
        capacity: event.capacity,
        emailQueued,
      });
    }

    if (path === '/api/event.ics' && method === 'GET') {
      // Emails name their gathering by date, so an older email keeps giving its own gathering
      // after the next one is set up.
      const date = url.searchParams.get('date') ?? '';
      const event = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? await db().eventOn(date)
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
      // Already cancelled (perhaps a moment ago, in another tab), or too late: say how things
      // stand rather than fail.
      return json(200, cancelView((await lookUpCancel(body)) ?? found));
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
      return json(200, {
        event,
        reserved: reservations.filter((r) => r.status === 'active').length,
        reservations: reservations.map(publicReservation),
        contributions,
        totals: contributionTotals(contributions),
        byDay: reservationsByDay(reservations, new Date()),
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
