import { announcementEmail } from './emails';
import type { AnnouncementRecord, Db, Mailer, OutboxItem } from './types';

/* Announcement emails wait in an outbox and go out in small batches: one right after publishing,
   then one every couple of minutes from the scheduled sender (netlify/functions/send-announcements).
   Batches stop at the daily limit, so a large list finishes the next day instead of hitting the
   mail service's cap. Each claim is atomic, so batches that overlap never send twice. */

export interface OutboxDeps {
  db: Db;
  mailer: Mailer;
  siteUrl: string;
  /** Emails in this batch. */
  limit: number;
  /** Most emails in any 24 hours. */
  dailyLimit: number;
  /** Stop starting new emails after this many milliseconds. With it, emails are claimed one at
   *  a time, so a run that is about to hit its platform time limit never leaves claimed emails it
   *  did not try (those would be given up as "did not finish" instead of sent later). */
  timeBudgetMs?: number;
  log?: (message: string, error?: unknown) => void;
}

type Result = 'sent' | 'failed' | 'skipped' | 'quota' | 'lost' | 'timeUp';

export async function processOutbox(deps: OutboxDeps): Promise<{ sent: number; failed: number }> {
  const { db, mailer, limit, dailyLimit } = deps;
  const site = deps.siteUrl.replace(/\/+$/, '');
  const log = deps.log ?? ((m: string, e?: unknown) => console.error(m, e ?? ''));
  const announcements = new Map<number, AnnouncementRecord | null>();
  const started = Date.now();
  const timed = deps.timeBudgetMs !== undefined;
  const timeUp = (): boolean => timed && Date.now() - started >= (deps.timeBudgetMs ?? 0);

  async function sendOne(item: OutboxItem): Promise<Result> {
    // Before sending: load the announcement and check the person is still subscribed. If either
    // lookup fails, nothing was sent, so the email goes back in the queue and the batch goes on.
    let record: AnnouncementRecord | null | undefined;
    try {
      if (!announcements.has(item.announcementId))
        announcements.set(item.announcementId, await db.announcementById(item.announcementId));
      record = announcements.get(item.announcementId);
      if (record && (await db.isUnsubscribed(item.email))) {
        await db.finishOutbox(item.id, item.claimToken, 'skipped', 'unsubscribed');
        return 'skipped';
      }
    } catch (e) {
      log(`Could not prepare outbox item ${item.id}; it will be tried again`, e);
      await db
        .finishOutbox(
          item.id,
          item.claimToken,
          'retry',
          'Could not check the announcement or subscription',
        )
        .catch((err: unknown) => log(`Could not requeue outbox item ${item.id}`, err));
      return 'failed';
    }
    if (!record) {
      await db.finishOutbox(item.id, item.claimToken, 'failed', 'announcement not found');
      return 'failed';
    }
    // The email as it was published; edits made since then only change the home page.
    const a = record.emailContent ?? record;
    const unsubscribeUrl = `${site}/#/unsubscribe/${item.unsubToken}`;
    const email = announcementEmail({
      announcement: {
        ...a,
        endDate: a.endDate ?? undefined,
        time: a.time ?? undefined,
        theme: a.theme ?? undefined,
        imageUrl: a.imageUrl ?? undefined,
        linkUrl: a.linkUrl ?? undefined,
        linkLabel: a.linkLabel ?? undefined,
      },
      name: item.name,
      email: item.email,
      siteUrl: site,
      unsubscribeUrl,
    });
    // The lookups above (or the claim itself) may have run past the time budget. Then this email
    // is not started: it goes back in the queue without using an attempt, and the batch stops.
    if (timeUp()) {
      await db
        .finishOutbox(item.id, item.claimToken, 'later', 'Not tried in this run')
        .catch((err: unknown) => log(`Could not requeue outbox item ${item.id}`, err));
      return 'timeUp';
    }
    // Start sending, in one step that only the run holding the claim can take. A run that stalled
    // past its claim (given back to the queue, or taken by another run) stops here.
    try {
      if (!(await db.beginOutbox(item.id, item.claimToken))) {
        log(`Outbox item ${item.id} is no longer claimed by this run; not sending`);
        return 'lost';
      }
    } catch (e) {
      log(`Could not start outbox item ${item.id}; it will be tried again`, e);
      await db
        .finishOutbox(item.id, item.claimToken, 'retry', 'Could not start sending')
        .catch((err: unknown) => log(`Could not requeue outbox item ${item.id}`, err));
      return 'failed';
    }
    try {
      await mailer.send({
        ...email,
        // Lets Gmail, Yahoo and Apple Mail show their own one-click "Unsubscribe" button.
        headers: {
          'List-Unsubscribe': `<${site}/api/unsubscribe?t=${item.unsubToken}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        // A repeat of this exact email is dropped by services that support it (Resend).
        idempotencyKey: `announcement-send-${item.id}`,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message.slice(0, 160) : 'error';
      // The mail service's quota is used up: nothing went out. It waits in the queue, without
      // using an attempt, and the batch stops until a later run.
      if (mailer.isQuota?.(e)) {
        log(`Mail quota reached (${mailer.kind}); outbox item ${item.id} waits`, e);
        await db
          .finishOutbox(item.id, item.claimToken, 'later', `Waiting for the mail quota: ${reason}`)
          .catch((err: unknown) => log(`Could not requeue outbox item ${item.id}`, err));
        return 'quota';
      }
      // Retry only when the mail service certainly did not take the email. A timeout may come
      // after it was accepted, so that one is closed as failed rather than risk a second copy.
      const retry = mailer.canRetry?.(e) ?? false;
      log(`Announcement ${record.id} to outbox item ${item.id} failed (${mailer.kind})`, e);
      await db
        .finishOutbox(
          item.id,
          item.claimToken,
          retry ? 'retry' : 'failed',
          retry ? reason : `${reason} (may have been delivered; not retried)`,
        )
        .catch((err: unknown) => log(`Could not record failure of outbox item ${item.id}`, err));
      return 'failed';
    }
    // Delivered. Recording it must never turn into a retry, which would send it twice: try a
    // few times, and if it still fails leave the row as claimed. An unfinished claim is closed
    // as failed (never sent again) once it is 10 minutes old.
    for (let attempt = 1; ; attempt++) {
      try {
        await db.finishOutbox(item.id, item.claimToken, 'sent');
        break;
      } catch (e) {
        if (attempt >= 3) {
          log(`Sent outbox item ${item.id} but could not record it`, e);
          break;
        }
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
    return 'sent';
  }

  let sent = 0;
  let failed = 0;
  let done = 0;
  let stop = false;
  const tried = new Set<number>();
  while (done < limit && !stop && !timeUp()) {
    const items = await db.claimOutbox(timed ? 1 : limit - done, dailyLimit);
    if (!items.length) break;
    for (const item of items) {
      // After the quota is reached, or when the queue hands back an email this run already
      // tried (only retries are left), put it back untried for a later run.
      if (stop || tried.has(item.id)) {
        stop = true;
        await db
          .finishOutbox(item.id, item.claimToken, 'later', 'Not tried in this run')
          .catch((err: unknown) => log(`Could not requeue outbox item ${item.id}`, err));
        continue;
      }
      tried.add(item.id);
      done++;
      const result = await sendOne(item);
      if (result === 'sent') sent++;
      else if (result === 'failed') failed++;
      else if (result === 'quota' || result === 'timeUp') stop = true;
    }
  }
  return { sent, failed };
}
