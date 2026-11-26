/** Formatting helpers shared by the views. All are pure functions. */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for safe interpolation into HTML text or attribute values. */
export const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);

/** Format an amount, e.g. 5000 -> "₦5,000", or (25, 'USD') -> "$25". */
export const money = (amount: number | null | undefined, currency: 'NGN' | 'USD' = 'NGN'): string =>
  (currency === 'USD' ? '$' : '₦') + Number(amount || 0).toLocaleString('en-NG');

/** Parse a YYYY-MM-DD date at midday local time, so time zones never shift the day. */
export const parseDate = (isoDate: string): Date => new Date(`${isoDate}T12:00:00`);

const fmt = (isoDate: string, options: Intl.DateTimeFormatOptions): string =>
  parseDate(isoDate).toLocaleDateString('en-GB', options);

/** "Saturday 30 January 2027" */
export const longDate = (isoDate: string): string =>
  fmt(isoDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Day of the month, e.g. 30 */
export const dayOfMonth = (isoDate: string): number => parseDate(isoDate).getDate();

/** "Saturday" */
export const weekday = (isoDate: string): string => fmt(isoDate, { weekday: 'long' });

/** "January 2027" */
export const monthYear = (isoDate: string): string =>
  fmt(isoDate, { month: 'long', year: 'numeric' });

/** "January" */
export const monthName = (isoDate: string): string => fmt(isoDate, { month: 'long' });

/** Reservation code for a seat number, e.g. 7 -> "JP-0007". */
export const reservationCode = (seat: number): string => `JP-${String(seat).padStart(4, '0')}`;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Read a start time such as "16:00", "4:00 PM", "4pm" or "8:00 WAT" as "HH:MM" (24-hour).
 *  Returns null for anything else, including a bare "4", which could be morning or afternoon. */
export function parseTime(text: string): string | null {
  const m = /^\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:wat)?\s*$/i.exec(text);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const half = m[3]?.toLowerCase()[0];
  if (min > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (half === 'p' ? 12 : 0);
  } else if (h > 23 || m[2] === undefined) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

/** "16:00" -> "4:00 PM WAT". Text that is not a time is shown as it was typed. */
export function displayTime(time: string): string {
  const t = parseTime(time);
  if (!t) return time;
  const [h = 0, m = 0] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'} WAT`;
}

/** When a gathering starts. Lagos is UTC+1 all year, with no daylight saving. */
export function startsAt(isoDate: string, time: string): Date | null {
  const t = parseTime(time);
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T${t}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
