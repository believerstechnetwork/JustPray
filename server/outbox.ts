import { announcementEmail } from './emails';
import type { AnnouncementRecord, Db, Mailer } from './types';

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
  log?: (message: string, error?: unknown) => void;
}

export async function processOutbox(deps: OutboxDeps): Promise<{ sent: number; failed: number }> {
  const { db, mailer, limit, dailyLimit } = deps;
  const site = deps.siteUrl.replace(/\/+$/, '');
  const log = deps.log ?? ((m: string, e?: unknown) => console.error(m, e ?? ''));
  const items = await db.claimOutbox(limit, dailyLimit);
  const announcements = new Map<number, AnnouncementRecord | null>();
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    if (!announcements.has(item.announcementId))
      announcements.set(item.announcementId, await db.announcementById(item.announcementId));
    const a = announcements.get(item.announcementId);
    if (!a) {
      await db.finishOutbox(item.id, false, 'announcement not found');
      failed++;
      continue;
    }
    // Unsubscribed since this email was queued: do not send it.
    if (await db.isUnsubscribed(item.email)) {
      await db.finishOutbox(item.id, false, 'unsubscribed', true);
      continue;
    }
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
    try {
      await mailer.send({
        ...email,
        // Lets Gmail, Yahoo and Apple Mail show their own one-click "Unsubscribe" button.
        headers: {
          'List-Unsubscribe': `<${site}/api/unsubscribe?t=${item.unsubToken}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
    } catch (e) {
      log(`Announcement ${a.id} to outbox item ${item.id} failed (${mailer.kind})`, e);
      await db
        .finishOutbox(item.id, false, e instanceof Error ? e.message.slice(0, 200) : 'error')
        .catch((err: unknown) => log(`Could not record failure of outbox item ${item.id}`, err));
      failed++;
      continue;
    }
    // Delivered. Recording it must never turn into a retry, which would send it twice: try a
    // few times, and if it still fails leave the row as claimed. An unfinished claim is closed
    // as failed (never sent again) once it is 10 minutes old.
    sent++;
    for (let attempt = 1; ; attempt++) {
      try {
        await db.finishOutbox(item.id, true);
        break;
      } catch (e) {
        if (attempt >= 3) {
          log(`Sent outbox item ${item.id} but could not record it`, e);
          break;
        }
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
    }
  }
  return { sent, failed };
}
