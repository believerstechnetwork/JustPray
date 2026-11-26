import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { handleApi, type ApiDeps } from './api';
import { MemoryMailer } from './mailer';
import { MemoryDb } from './memory-db';
import { processOutbox } from './outbox';

/** Password for the organiser area when running locally (`npm run dev` / e2e tests). */
export const DEV_ADMIN_PASSWORD = 'dev-password';

/**
 * Serves `/api/*` from an in-memory database during `vite dev` and `vite preview`, so the
 * site works locally and in end-to-end tests without Supabase or email. Vite loads it only
 * for the dev and preview servers, never for the production build. Under `netlify dev`
 * (NETLIFY_DEV is set) it stays off and the real function handles `/api/*`.
 */
export function devApiMiddleware(): Connect.NextHandleFunction {
  const mailer = new MemoryMailer();
  const deps: ApiDeps = {
    db: new MemoryDb({
      title: 'Just Pray · A Gathering of Hearts',
      date: '2027-01-30',
      time: '16:00',
      venue: 'Sample venue, Lagos',
      capacity: 120,
    }),
    mailer,
    adminPassword: process.env.ADMIN_PASSWORD || DEV_ADMIN_PASSWORD,
    banks: {
      NGN: {
        bankName: 'Sample Bank',
        accountName: 'Just Pray (sample)',
        accountNumber: '0000000000',
      },
      USD: {
        bankName: 'Sample Bank (USD)',
        accountName: 'Just Pray (sample)',
        accountNumber: '1111111111',
        swiftCode: 'SAMPNGLA',
      },
    },
    defer: (work) => void work,
    failedLoginDelayMs: 50,
    testEmail: 'organisers@example.com',
    log: (m, e) => console.warn(`[dev api] ${m}`, e ?? ''),
  };

  // Stand-in for the scheduled sender: work through queued announcement emails locally. Links
  // in them point at the address the site is being served from (port included), the same
  // origin the API uses for the first batch it sends right after publishing.
  let origin = 'http://localhost:5173';
  if (deps.db && deps.mailer) {
    const { db, mailer } = deps;
    setInterval(() => {
      void processOutbox({ db, mailer, siteUrl: origin, limit: 20, dailyLimit: 350 });
    }, 3000).unref();
  }

  return (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    if (req.headers.host) origin = `http://${req.headers.host}`;
    // Local only: the emails "sent" so far, so end-to-end tests can follow their links.
    if (req.url === '/api/dev/mail') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(mailer.sent.map(({ to, subject, text }) => ({ to, subject, text }))));
      return;
    }
    void serve(req, res, deps).catch((e: unknown) => {
      console.error('[dev api]', e);
      res.statusCode = 500;
      res.end();
    });
  };
}

async function serve(req: IncomingMessage, res: ServerResponse, deps: ApiDeps): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }
  const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, {
    method: req.method,
    headers,
    body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
  });
  const response = await handleApi(request, deps);
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await response.arrayBuffer()));
}
