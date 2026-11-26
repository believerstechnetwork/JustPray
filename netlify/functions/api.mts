import type { Config, Context } from '@netlify/functions';
import { banksFromEnv, handleApi } from '../../server/api';
import { mailerFromEnv } from '../../server/mailer';
import { SupabaseDb } from '../../server/supabase-db';

const env = process.env;
const db =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
const mailer = mailerFromEnv(env);
const banks = banksFromEnv(env);

export default async (req: Request, context: Context): Promise<Response> =>
  handleApi(req, {
    db,
    mailer,
    banks,
    adminPassword: env.ADMIN_PASSWORD ?? '',
    // Netlify sets URL to the site's main address, in deploy previews too.
    siteUrl: env.SITE_URL || env.URL,
    testEmail: env.EMAIL_REPLY_TO || env.GMAIL_USER,
    dailyLimit: Number(env.ANNOUNCE_DAILY_LIMIT) || undefined,
    // Send emails after responding, so a slow mail server never delays the visitor.
    defer: (work) => {
      if (typeof context.waitUntil === 'function') context.waitUntil(work);
      else void work;
    },
  });

export const config: Config = { path: '/api/*' };
