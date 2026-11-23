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

/** Format a number of naira, e.g. 5000 -> "₦5,000". */
export const money = (amount: number | null | undefined): string =>
  '₦' + Number(amount || 0).toLocaleString('en-NG');

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
