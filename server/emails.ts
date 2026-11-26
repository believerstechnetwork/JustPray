import { esc, longDate } from '../src/lib/format';
import type { Email, EventDetails } from './types';

export interface ConfirmationInput {
  name: string;
  email: string;
  code: string;
  event: EventDetails;
  siteUrl: string;
}

/** The email sent when someone reserves a seat. */
export function reservationEmail({ name, email, code, event, siteUrl }: ConfirmationInput): Email {
  const first = name.split(' ')[0] || name;
  const date = longDate(event.date);
  const text = [
    `Hi ${first},`,
    '',
    `Your seat for ${event.title} is reserved.`,
    '',
    `Reservation code: ${code}`,
    `Date: ${date}`,
    `Time: ${event.time}`,
    `Venue: ${event.venue}`,
    '',
    'Attendance is free. If you can no longer come, reply to this email so we can give your seat to someone else.',
    '',
    'See you there,',
    'Just Pray, Believers Tech Network',
    siteUrl,
  ].join('\n');

  const row = (k: string, v: string): string =>
    `<tr><td style="padding:6px 16px 6px 0;color:#4d5b4f">${k}</td><td style="padding:6px 0;font-weight:700">${esc(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6ee;font-family:Arial,Helvetica,sans-serif;color:#04200b">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 4px;font-size:13px;font-weight:700;letter-spacing:.04em;color:#0d7a22">JUST PRAY</p>
<h1 style="margin:0 0 16px;font-size:26px">You're in, ${esc(first)}.</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">Your seat for ${esc(event.title)} is reserved.</p>
<table style="border-collapse:collapse;font-size:15px;margin:0 0 20px">
${row('Code', code)}${row('Date', date)}${row('Time', event.time)}${row('Venue', event.venue)}
</table>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">Attendance is free. If you can no longer come, reply to this email so we can give your seat to someone else.</p>
<p style="margin:0;font-size:15px;line-height:1.5">See you there,<br>Just Pray, Believers Tech Network<br><a href="${esc(siteUrl)}" style="color:#0d7a22">${esc(siteUrl)}</a></p>
</div></body></html>`;

  return { to: email, subject: `Your seat for Just Pray: ${date}`, text, html };
}
