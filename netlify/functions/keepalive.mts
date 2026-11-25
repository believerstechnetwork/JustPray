import type { Config } from '@netlify/functions';
import { SupabaseDb } from '../../server/supabase-db';

/** Supabase pauses free projects after a week without activity. One small query a day prevents that. */
export default async (): Promise<Response> => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Response('not configured');
  await new SupabaseDb(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).ping();
  return new Response('ok');
};

export const config: Config = { schedule: '@daily' };
