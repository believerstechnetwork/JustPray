import { googleCalendarUrl, mapsUrl } from '../src/lib/calendar';
import { displayTime, esc, longDate } from '../src/lib/format';
import type { Email, EventDetails } from './types';

/* One design for every email: an indigo band with the logo, a white card shaped like the
   pass, and a quiet footer. Tables and inline styles, because that is what Gmail, Outlook
   and Apple Mail all render the same way. Classes are only for the dark-mode overrides,
   which clients that do not support them simply ignore. */

const C = {
  indigo: '#0E2766',
  blue: '#0A6FC2',
  gold: '#F5B841',
  canvas: '#EEF3FA',
  card: '#FFFFFF',
  tint: '#F4F8FD',
  ink: '#0D1A3A',
  ink2: '#4A5A7A',
  rule: '#DCE5F2',
};
const SERIF = "'Young Serif',Georgia,'Times New Roman',serif";

/** A solid colour that mail apps' dark modes leave alone. Outlook and Gmail repaint background
 *  colours in dark mode (indigo turns washed-out purple, gold turns brown), but they do not
 *  repaint background images, so the colour is set as a one-colour gradient too. Use it only
 *  where the text is already light, since the apps still lighten dark text. */
const fixed = (colour: string): string =>
  `background-color:${colour};background-image:linear-gradient(${colour},${colour})`;
const SANS = "Figtree,'Segoe UI',Helvetica,Arial,sans-serif";

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

interface Detail {
  label: string;
  value: string;
}

/** A button that survives Outlook: a padded link inside a coloured table cell. */
function button(label: string, href: string, kind: 'solid' | 'outline'): string {
  const solid = kind === 'solid';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 10px 0"><tr><td class="${solid ? 'btn-solid' : 'btn-outline'}" style="border-radius:12px;${solid ? fixed(C.indigo) : `background:${C.card}`};border:1.5px solid ${solid ? C.indigo : C.rule}"><a href="${esc(href)}" style="display:inline-block;padding:13px 22px;font:600 15px/1 ${SANS};color:${solid ? '#FFFFFF' : C.indigo};text-decoration:none;border-radius:12px">${label}</a></td></tr></table>`;
}

/** The pass: an indigo strip with the seat number in gold, then the details on a perforated stub. */
function pass(seat: number | null, details: Detail[], muted = false): string {
  const cells = details
    .map(
      (d) =>
        `<td class="stub-cell" valign="top" width="50%" style="padding:0 12px 16px 0"><div class="mute" style="font:600 11px/1.3 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${C.ink2}">${esc(d.label)}</div><div class="ink" style="font:600 16px/1.4 ${SANS};color:${C.ink};padding-top:3px">${esc(d.value)}</div></td>`,
    )
    .reduce<string[]>((rows, cell, i) => {
      if (i % 2 === 0) rows.push(cell);
      else rows[rows.length - 1] += cell;
      return rows;
    }, [])
    .map((r) => `<tr>${r}</tr>`)
    .join('');
  const seatCell =
    seat === null
      ? ''
      : `<td align="right" valign="bottom" style="font:400 13px/1 ${SANS};letter-spacing:.12em;color:#C5D6F2">SEAT <span style="font:400 44px/1 ${SERIF};letter-spacing:0;color:${muted ? '#8FA3C8' : C.gold}">${seat}</span></td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:28px 0 26px">
<tr><td style="${fixed(C.indigo)};border-radius:16px 16px 0 0;padding:20px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="bottom" style="font:600 12px/1 ${SANS};letter-spacing:.16em;text-transform:uppercase;color:#C5D6F2">${muted ? 'Cancelled' : 'Admit one'}</td>${seatCell}</tr></table></td></tr>
<tr><td class="stub" style="background:${C.tint};border-top:2px dashed ${C.rule};border-radius:0 0 16px 16px;padding:20px 22px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr>
</table>`;
}

interface LayoutInput {
  /** Shown by inboxes under the subject line. */
  preheader: string;
  heading: string;
  /** Trusted HTML: build it from escaped values. */
  body: string;
  /** Why this person is getting the email. */
  reason: string;
  siteUrl: string;
  /** A wide picture under the header, e.g. an event's banner. Absolute URL. */
  banner?: string;
  bannerAlt?: string;
  /** Shown in the footer of announcements; required for bulk email. */
  unsubscribeUrl?: string;
}

function layout(input: LayoutInput): string {
  const { preheader, heading, body, reason, siteUrl, banner, bannerAlt, unsubscribeUrl } = input;
  const site = siteUrl.replace(/\/+$/, '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600&family=Young+Serif&display=swap" rel="stylesheet">
<style>
@media (max-width:520px){.wrap{padding:20px 12px !important}.card{padding:28px 22px !important}.stub-cell{display:block !important;width:100% !important}h1{font-size:28px !important}}
@media (prefers-color-scheme:dark){
body,.bg{background:#081128 !important}.card{background:#0F1E44 !important}
.ink,h1,.card p{color:#EDF2FB !important}.mute,.foot{color:#A8B8D6 !important}
.stub{background:#17284F !important;border-top-color:#2F4479 !important}
.btn-outline{background:#0F1E44 !important;border-color:#2F4479 !important}.btn-outline a{color:#EDF2FB !important}
.btn-solid{background:#F5B841 !important;border-color:#F5B841 !important}.btn-solid a{color:#3A2600 !important}
.link{color:#7AB9F5 !important}.rule{border-top-color:#1F3263 !important}
}
</style></head>
<body class="bg" style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${'&#8199;&#65279;&#847; '.repeat(40)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas}"><tr><td class="wrap" align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="${fixed(C.indigo)};border-radius:20px 20px 0 0;padding:22px 28px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><a href="${esc(site)}" style="color:#FFFFFF;text-decoration:none"><img src="${esc(site)}/email/logo.png" width="150" height="48" alt="Believers Tech Network" style="display:block;border:0;width:150px;height:auto;color:#FFFFFF;font:600 15px/1.25 ${SANS};text-decoration:none"></a></td>
<td valign="middle" style="padding:0 0 0 16px"><div style="width:1px;height:30px;background:#3A5296"></div></td>
<td valign="middle" style="padding:0 0 0 16px;font:400 20px/1 ${SERIF};color:#FFFFFF;white-space:nowrap">Just Pray</td>
</tr></table></td></tr>
<tr><td style="height:4px;${fixed(C.gold)};line-height:4px;font-size:0">&nbsp;</td></tr>
${banner ? `<tr><td style="background:${C.card};font-size:0;line-height:0"><img src="${esc(banner)}" width="560" alt="${esc(bannerAlt ?? '')}" style="display:block;width:100%;height:auto;max-height:280px;object-fit:cover;border:0"></td></tr>` : ''}
<tr><td class="card" style="background:${C.card};border-radius:0 0 20px 20px;padding:36px 36px 30px;font:400 16px/1.6 ${SANS};color:${C.ink}">
<h1 style="margin:0 0 12px;font:400 32px/1.15 ${SERIF};color:${C.ink}">${heading}</h1>
${body}
</td></tr>
<tr><td class="foot" align="center" style="padding:24px 12px 8px;font:400 13px/1.6 ${SANS};color:${C.ink2}">
Just Pray · a free monthly prayer gathering for people in tech<br>by Believers Tech Network · <a class="link" href="${esc(site)}" style="color:${C.blue};text-decoration:none">${esc(site.replace(/^https?:\/\//, ''))}</a><br><span style="font-size:12px">${esc(reason)}${unsubscribeUrl ? `<br><a class="link" href="${esc(unsubscribeUrl)}" style="color:${C.blue};font-weight:600">Unsubscribe or manage your emails</a>` : ''}</span>
</td></tr>
</table></td></tr></table></body></html>`;
}

const para = (html: string, extra = ''): string =>
  `<p style="margin:0 0 14px;font:400 16px/1.6 ${SANS};color:${C.ink};${extra}">${html}</p>`;

const eventDetails = (code: string, event: EventDetails): Detail[] => [
  { label: 'Date', value: longDate(event.date) },
  { label: 'Time', value: displayTime(event.time) },
  { label: 'Venue', value: event.venue },
  { label: 'Code', value: code },
];

export interface ConfirmationInput {
  name: string;
  email: string;
  seat: number;
  code: string;
  event: EventDetails;
  /** The gathering's record id, so the calendar-file link keeps naming this gathering. */
  eventId?: number | null;
  siteUrl: string;
  /** Private link that lets this person cancel their own seat. */
  cancelUrl: string;
}

/** The email sent when someone reserves a seat. */
export function reservationEmail(input: ConfirmationInput): Email {
  const { name, email, seat, code, event, eventId, siteUrl, cancelUrl } = input;
  const first = firstName(name);
  const date = longDate(event.date);
  const time = displayTime(event.time);
  const site = siteUrl.replace(/\/+$/, '');
  const calendar = googleCalendarUrl(event, site);
  const ics = `${site}/api/event.ics${eventId ? `?event=${eventId}` : ''}`;
  const maps = mapsUrl(event.venue);

  const text = [
    `Hi ${first},`,
    '',
    `Seat ${seat} is yours for ${event.title}.`,
    '',
    `Date:  ${date}`,
    `Time:  ${time}`,
    `Venue: ${event.venue}`,
    `Code:  ${code}`,
    '',
    `Add it to your calendar: ${calendar}`,
    `Apple or Outlook calendar: ${ics}`,
    `Directions: ${maps}`,
    '',
    'Attendance is free.',
    '',
    `Can't make it? Cancel your seat so someone else can come: ${cancelUrl}`,
    '',
    'See you there,',
    'Just Pray, Believers Tech Network',
    site,
  ].join('\n');

  const body = `${para(`Seat ${seat} is yours for ${esc(event.title)}. Attendance is free.`)}
${pass(seat, eventDetails(code, event))}
<div>${button('Add to calendar', calendar, 'solid')}${button('Get directions', maps, 'outline')}</div>
${para(`Using Apple or Outlook? <a class="link" href="${esc(ics)}" style="color:${C.blue}">Download the calendar file</a>.`, `font-size:14px;color:${C.ink2};margin:4px 0 0`)}
<div class="rule" style="border-top:1px solid ${C.rule};margin:26px 0 20px"></div>
${para(`Can’t make it? <a class="link" href="${esc(cancelUrl)}" style="color:${C.blue};font-weight:600">Cancel my seat</a> so someone else can come.`, `font-size:15px;margin:0`)}`;

  return {
    to: email,
    subject: `Seat ${seat} is yours: Just Pray, ${date}`,
    text,
    html: layout({
      preheader: `${time} at ${event.venue}. Add it to your calendar.`,
      heading: `You’re in, ${esc(first)}.`,
      body,
      reason: 'You’re getting this because you reserved a seat.',
      siteUrl: site,
    }),
  };
}

export interface CancelledInput {
  name: string;
  email: string;
  seat: number;
  code: string;
  event: EventDetails;
  siteUrl: string;
}

/** The email sent when someone cancels their seat. */
export function cancelledEmail(input: CancelledInput): Email {
  const { name, email, seat, code, event, siteUrl } = input;
  const first = firstName(name);
  const date = longDate(event.date);
  const site = siteUrl.replace(/\/+$/, '');
  const again = `${site}/#/register`;

  const text = [
    `Hi ${first},`,
    '',
    `Your seat for ${event.title} on ${date} is cancelled, and seat ${seat} (${code}) is free for someone else.`,
    '',
    `Thank you for letting us know. If your plans change, you can reserve again while seats remain: ${again}`,
    '',
    'Just Pray, Believers Tech Network',
    site,
  ].join('\n');

  const body = `${para(`Seat ${seat} is free again for someone else. Thank you for letting us know.`)}
${pass(seat, eventDetails(code, event), true)}
${para('If your plans change, you can reserve again while seats remain.')}
<div style="padding-top:6px">${button('Reserve again', again, 'solid')}</div>`;

  return {
    to: email,
    subject: `Your seat is cancelled: Just Pray, ${date}`,
    text,
    html: layout({
      preheader: `Seat ${seat} is free again. You can reserve again while seats remain.`,
      heading: `Seat cancelled, ${esc(first)}.`,
      body,
      reason: 'You’re getting this because you cancelled your seat.',
      siteUrl: site,
    }),
  };
}

/* ---------- announcements: other BTN events, sent to people who asked to hear about them ---------- */

export interface AnnouncementContent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** Optional last day, for events over several days. */
  endDate?: string;
  /** Optional "HH:MM" start time in Lagos. */
  time?: string;
  theme?: string;
  themeTba?: boolean;
  /** A place, or "Online". With `venueTba`, an optional city. */
  venue: string;
  venueTba?: boolean;
  /** One or two sentences, used on the site and as the inbox preview line. */
  summary: string;
  /** Absolute URL of a wide picture, optional. */
  imageUrl?: string;
  /** Where people register or read more, optional. */
  linkUrl?: string;
  linkLabel?: string;
  subject: string;
  /** The email's message. Blank lines start paragraphs; **bold**, [text](link) and plain links work.
   *  "{first name}" is replaced with each person's first name. */
  message: string;
}

/** Dates as people say them: "Thursday, 9 September 2027", or "9 to 11 September 2027". */
export function eventDates(date: string, endDate?: string): string {
  if (!endDate || endDate === date) return longDate(date);
  const a = new Date(`${date}T12:00:00`);
  const b = new Date(`${endDate}T12:00:00`);
  const dm = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
    return `${a.getDate()} to ${dm(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return `${dm(a, { day: 'numeric', month: 'long' })} to ${dm(b, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** "Landmark Centre, Lagos"; "Lagos · venue to be announced"; or "Venue to be announced". */
export function venueLine(a: { venue: string; venueTba?: boolean | null }): string {
  const v = a.venue.trim();
  if (!a.venueTba) return v;
  return v ? `${v} · venue to be announced` : 'Venue to be announced';
}

/** The theme as shown, "To be announced", or null when the event has no theme. */
export function themeLine(a: { theme?: string | null; themeTba?: boolean | null }): string | null {
  if (a.themeTba) return 'To be announced';
  return a.theme?.trim() || null;
}

/** The small set of formatting the message box allows, made safe: everything is escaped first. */
export function messageHtml(message: string, linkColour: string = C.blue): string[] {
  const inline = (line: string): string =>
    esc(line)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
        (_m, text: string | undefined, href: string | undefined, bare: string | undefined) => {
          const url = href ?? bare ?? '';
          return `<a href="${url}" style="color:${linkColour}">${text ?? url}</a>`;
        },
      );
  return message
    .trim()
    .split(/\n\s*\n/)
    .filter((p) => p.trim())
    .map((p) => p.split('\n').map(inline).join('<br>'));
}

const personalise = (text: string, first: string): string =>
  text.replace(/\{\s*first name\s*\}/gi, first || 'friend');

/** The event card in an announcement: an indigo strip with the date, then the details. */
function eventCard(a: AnnouncementContent): string {
  const theme = themeLine(a);
  const details: Detail[] = [
    { label: 'Date', value: eventDates(a.date, a.endDate) },
    ...(a.time ? [{ label: 'Time', value: displayTime(a.time) }] : []),
    { label: a.venue.toLowerCase() === 'online' ? 'Where' : 'Venue', value: venueLine(a) },
    ...(theme ? [{ label: 'Theme', value: theme }] : []),
  ];
  const d = new Date(`${a.date}T12:00:00`);
  const month = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  // Two details per row, so a long venue or theme has room.
  const cells = details
    .map(
      (x) =>
        `<td class="stub-cell" valign="top" width="50%" style="padding:0 16px 16px 0"><div class="mute" style="font:600 11px/1.3 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${C.ink2}">${esc(x.label)}</div><div class="ink" style="font:600 16px/1.4 ${SANS};color:${C.ink};padding-top:3px">${esc(x.value)}</div></td>`,
    )
    .reduce<string[]>((rows, cell, i) => {
      if (i % 2 === 0) rows.push(cell);
      else rows[rows.length - 1] += cell;
      return rows;
    }, [])
    .map((r) => `<tr>${r}</tr>`)
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:26px 0 24px">
<tr><td style="${fixed(C.indigo)};border-radius:16px 16px 0 0;padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="bottom" style="font:600 12px/1.4 ${SANS};letter-spacing:.16em;text-transform:uppercase;color:#C5D6F2">From Believers<br>Tech Network</td><td align="right" valign="bottom" style="font:400 13px/1 ${SANS};letter-spacing:.12em;color:#C5D6F2">${month} <span style="font:400 40px/1 ${SERIF};letter-spacing:0;color:${C.gold}">${d.getDate()}</span></td></tr></table></td></tr>
<tr><td class="stub" style="background:${C.tint};border-top:2px dashed ${C.rule};border-radius:0 0 16px 16px;padding:18px 22px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr>
</table>`;
}

export interface AnnouncementInput {
  announcement: AnnouncementContent;
  name: string;
  email: string;
  siteUrl: string;
  unsubscribeUrl: string;
}

/** An announcement of another BTN event, to someone who asked to hear about future events. */
export function announcementEmail(input: AnnouncementInput): Email {
  const { announcement: a, name, email, siteUrl, unsubscribeUrl } = input;
  const site = siteUrl.replace(/\/+$/, '');
  const first = firstName(name);
  const message = personalise(a.message, first);
  const when = [eventDates(a.date, a.endDate), a.time ? displayTime(a.time) : '']
    .filter(Boolean)
    .join(', ');
  const text = [
    message.trim(),
    '',
    a.title,
    `When:  ${when}`,
    `Where: ${venueLine(a)}`,
    ...(themeLine(a) ? [`Theme: ${themeLine(a)}`] : []),
    ...(a.linkUrl ? ['', `${a.linkLabel || 'Learn more'}: ${a.linkUrl}`] : []),
    '',
    'Believers Tech Network',
    site,
    '',
    `You're getting this because you asked to hear about future events. Unsubscribe or manage your emails: ${unsubscribeUrl}`,
  ].join('\n');
  const body = `${messageHtml(message)
    .map((p) => para(p))
    .join('\n')}
${eventCard(a)}
${a.linkUrl ? `<div>${button(esc(a.linkLabel || 'Learn more'), a.linkUrl, 'solid')}</div>` : ''}`;
  return {
    to: email,
    subject: a.subject,
    text,
    html: layout({
      preheader: a.summary,
      heading: esc(a.title),
      body,
      reason: 'You’re getting this because you asked to hear about future events.',
      siteUrl: site,
      banner: a.imageUrl,
      bannerAlt: a.title,
      unsubscribeUrl,
    }),
  };
}
