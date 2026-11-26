import type { AnnouncementRecord } from './types';

/** The order the home page lists other events in. An event already under way (it started before
 *  today and has not ended) counts as starting today, so it never pushes today's events off the
 *  list; on the same day, the newest comes first. */
export function orderUpcoming(
  list: AnnouncementRecord[],
  todayIso: string,
  limit: number,
): AnnouncementRecord[] {
  const from = (a: AnnouncementRecord): string => (a.date < todayIso ? todayIso : a.date);
  return [...list].sort((a, b) => from(a).localeCompare(from(b)) || b.id - a.id).slice(0, limit);
}
