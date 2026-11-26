import type { AnnouncementRecord } from './types';

/** The order the home page lists other events in. An event already under way (it started before
 *  today and has not ended) counts as starting today, so it never pushes today's events off the
 *  list. On the same day, events that really start today come before ones already under way, and
 *  within each group the newest comes first. */
export function orderUpcoming(
  list: AnnouncementRecord[],
  todayIso: string,
  limit: number,
): AnnouncementRecord[] {
  const from = (a: AnnouncementRecord): string => (a.date < todayIso ? todayIso : a.date);
  const running = (a: AnnouncementRecord): number => (a.date < todayIso ? 1 : 0);
  return [...list]
    .sort((a, b) => from(a).localeCompare(from(b)) || running(a) - running(b) || b.id - a.id)
    .slice(0, limit);
}
