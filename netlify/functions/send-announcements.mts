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
    // About 20 emails fit comfortably in one run's time limit.
    limit: 20,
    dailyLimit: Number(env.ANNOUNCE_DAILY_LIMIT) || DAILY_LIMIT,
  });
  return new Response(JSON.stringify(result));
};

export const config: Config = { schedule: '*/2 * * * *' };
