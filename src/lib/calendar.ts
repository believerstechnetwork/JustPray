/** Calendar and map links for a gathering. Pure functions, shared by the site and the emails. */
import { longDate, startsAt } from './format';

export interface CalendarEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  time: string;
  venue: string;
}

/** Calendars get a two-hour slot; the gatherings have no set end time. */
const LENGTH_MS = 2 * 60 * 60 * 1000;

const utcStamp = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dayStamp = (iso: string): string => iso.replace(/-/g, '');
const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Start and end in calendar form; an all-day slot when the time cannot be read. */
function span(e: CalendarEvent): { start: string; end: string; allDay: boolean } {
  const start = startsAt(e.date, e.time);
  if (!start) return { start: dayStamp(e.date), end: dayStamp(nextDay(e.date)), allDay: true };
  return {
    start: utcStamp(start),
    end: utcStamp(new Date(start.getTime() + LENGTH_MS)),
    allDay: false,
  };
}

export function googleCalendarUrl(e: CalendarEvent, siteUrl: string): string {
  const { start, end } = span(e);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${start}/${end}`,
    location: e.venue,
    details: `A free prayer gathering for people in tech, by Believers Tech Network.\n${siteUrl}`,
    ctz: 'Africa/Lagos',
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export const mapsUrl = (venue: string): string =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;

/** Escape text for an iCalendar value. */
const icsText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** iCalendar lines may be at most 75 octets; longer ones continue on a line starting with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** An .ics file for Apple Calendar, Outlook and others. */
export function icsFile(e: CalendarEvent, siteUrl: string, now = new Date()): string {
  const { start, end, allDay } = span(e);
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const when = allDay
    ? [`DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`]
    : [`DTSTART:${start}`, `DTEND:${end}`];
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Believers Tech Network//Just Pray//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:just-pray-${e.date}@${host}`,
      `DTSTAMP:${utcStamp(now)}`,
      ...when,
      `SUMMARY:${icsText(e.title)}`,
      `LOCATION:${icsText(e.venue)}`,
      `DESCRIPTION:${icsText(`${longDate(e.date)}. A free prayer gathering for people in tech, by Believers Tech Network. ${siteUrl}`)}`,
      `URL:${siteUrl}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .map(fold)
      .join('\r\n') + '\r\n'
  );
}
