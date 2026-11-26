import { describe, expect, it } from 'vitest';
import { cancelledEmail, reservationEmail } from '../../server/emails';
import { googleCalendarUrl, icsFile, mapsUrl } from '../../src/lib/calendar';
import { displayTime, parseTime, startsAt } from '../../src/lib/format';

const EVENT = {
  title: 'Just Pray · A Gathering of Hearts',
  date: '2027-01-30',
  time: '16:00',
  venue: 'Sample venue, Lagos',
  capacity: 120,
};
const SITE = 'https://justprayy.netlify.app';

describe('start times', () => {
  it('reads the picker value and the free text older gatherings used', () => {
    expect(parseTime('16:00')).toBe('16:00');
    expect(parseTime('4:00 PM WAT')).toBe('16:00');
    expect(parseTime('4pm')).toBe('16:00');
    expect(parseTime('8:00 WAT')).toBe('08:00');
    expect(parseTime('12:15 a.m.')).toBe('00:15');
    expect(parseTime('12 PM')).toBe('12:00');
  });

  it('refuses what is not a clear time', () => {
    for (const t of ['4', 'evening', '25:00', '4:75 PM', '13 PM', ''])
      expect(parseTime(t)).toBeNull();
  });

  it('shows times the Lagos way, and leaves unreadable text as typed', () => {
    expect(displayTime('16:00')).toBe('4:00 PM WAT');
    expect(displayTime('09:05')).toBe('9:05 AM WAT');
    expect(displayTime('00:30')).toBe('12:30 AM WAT');
    expect(displayTime('After service')).toBe('After service');
  });

  it('works out the start in UTC, Lagos being UTC+1', () => {
    expect(startsAt('2027-01-30', '16:00')?.toISOString()).toBe('2027-01-30T15:00:00.000Z');
    expect(startsAt('2027-01-30', 'evening')).toBeNull();
  });
});

describe('calendar links', () => {
  it('builds a Google Calendar link with a two-hour slot', () => {
    const url = new URL(googleCalendarUrl(EVENT, SITE));
    expect(url.searchParams.get('dates')).toBe('20270130T150000Z/20270130T170000Z');
    expect(url.searchParams.get('text')).toBe(EVENT.title);
    expect(url.searchParams.get('location')).toBe(EVENT.venue);
  });

  it('falls back to an all-day slot when the time cannot be read', () => {
    const url = new URL(googleCalendarUrl({ ...EVENT, time: 'after work' }, SITE));
    expect(url.searchParams.get('dates')).toBe('20270130/20270131');
    expect(icsFile({ ...EVENT, time: 'after work' }, SITE)).toContain(
      'DTSTART;VALUE=DATE:20270130',
    );
  });

  it('writes a valid calendar file: escaped values, CRLF, folded long lines', () => {
    const ics = icsFile({ ...EVENT, venue: 'Hall 2; Block A, Ikeja\nLagos' }, SITE);
    expect(ics).toContain('LOCATION:Hall 2\\; Block A\\, Ikeja\\nLagos');
    expect(ics.endsWith('\r\n')).toBe(true);
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain('UID:just-pray-2027-01-30@justprayy.netlify.app');
  });

  it('links the venue to Google Maps', () => {
    expect(mapsUrl('A & B, Lagos')).toBe(
      'https://www.google.com/maps/search/?api=1&query=A%20%26%20B%2C%20Lagos',
    );
  });
});

describe('emails', () => {
  const confirm = (name = 'Ada Obi') =>
    reservationEmail({
      name,
      email: 'ada@example.com',
      seat: 48,
      code: 'JP-0048',
      event: EVENT,
      siteUrl: `${SITE}/`,
      cancelUrl: `${SITE}/#/cancel/tok`,
    });

  it('confirms the seat with the details, calendar, directions and cancel link', () => {
    const e = confirm();
    expect(e.subject).toBe('Seat 48 is yours: Just Pray, Saturday, 30 January 2027');
    for (const part of [e.text, e.html]) {
      expect(part).toContain('4:00 PM WAT');
      expect(part).toContain('JP-0048');
      expect(part).toContain('calendar.google.com');
      expect(part).toContain(`${SITE}/api/event.ics`);
      expect(part).toContain('google.com/maps');
      expect(part).toContain(`${SITE}/#/cancel/tok`);
    }
    expect(e.html).toContain(`${SITE}/email/logo.png`);
    expect(e.html).not.toContain(`${SITE}//`);
    expect(e.text).toMatch(/^Hi Ada,/);
  });

  it('escapes names and event details in the HTML', () => {
    const e = confirm('<script>x</script> Obi');
    expect(e.html).not.toContain('<script>x');
    expect(e.html).toContain('&lt;script&gt;');
  });

  it('confirms a cancellation and offers to reserve again', () => {
    const e = cancelledEmail({
      name: 'Ada Obi',
      email: 'ada@example.com',
      seat: 48,
      code: 'JP-0048',
      event: EVENT,
      siteUrl: SITE,
    });
    expect(e.to).toBe('ada@example.com');
    expect(e.subject).toBe('Your seat is cancelled: Just Pray, Saturday, 30 January 2027');
    expect(e.text).toContain('seat 48 (JP-0048) is free');
    expect(e.html).toContain(`${SITE}/#/register`);
    expect(e.html).toContain('Cancelled');
  });
});
