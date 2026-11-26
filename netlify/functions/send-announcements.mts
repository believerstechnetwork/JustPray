import type { Config } from '@netlify/functions';
import { DAILY_LIMIT, PRODUCTION_URL } from '../../server/api';
import { mailerFromEnv } from '../../server/mailer';
import { processOutbox } from '../../server/outbox';
import { SupabaseDb } from '../../server/supabase-db';

/** Every two minutes, send the next small batch of queued announcement emails. Batches stop at
 *  the daily limit, so a large list finishes over more than one day. Scheduled functions run
 *  on the live site only, never on deploy previews. */
export default async (): Promise<Response> => {
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return new Response('not configured');
  const mailer = mailerFromEnv(env);
  if (!mailer) return new Response('email not configured');
  const result = await processOutbox({
    db: new SupabaseDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    mailer,
    siteUrl: env.SITE_URL || env.URL || PRODUCTION_URL,
    limit: 20,
    // Scheduled functions stop at 30 seconds, and one email can take up to 10. Start no new email
    // after 15 seconds, so every email this run claims is actually tried.
    timeBudgetMs: 15_000,
    dailyLimit: Number(env.ANNOUNCE_DAILY_LIMIT) || DAILY_LIMIT,
  });
  return new Response(JSON.stringify(result));
};

export const config: Config = { schedule: '*/2 * * * *' };
