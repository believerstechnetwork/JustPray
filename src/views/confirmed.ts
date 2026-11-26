import { passCloth, pattern } from '../lib/cloth';
import { displayTime, esc, longDate } from '../lib/format';
import { tearPolygon } from '../lib/tear';
import { S } from '../state';
import { btn, footer, nav } from './common';

export interface PassDetails {
  seat?: number;
  name: string;
  eventTitle: string;
  code: string;
  /** YYYY-MM-DD, or '' when the gathering has not loaded. */
  date: string;
  time: string;
  venue: string;
  phone?: string;
  /** A cancelled seat: the pass is shown greyed out. */
  void?: boolean;
}

/** The pass: cloth strip with the seat number, the holder, and a torn stub with the details. */
export function passCard(p: PassDetails): string {
  const date = p.date ? longDate(p.date) : 'the next gathering';
  return `<div class="pass-wrap"><div class="pass${p.void ? ' void' : ''}" style="clip-path:${tearPolygon(41)}">
  <div class="top">${passCloth()}<span class="adm">${p.void ? 'Cancelled' : 'Admit one'}</span>${p.seat ? `<span class="seatno num"><small>SEAT</small>${p.seat}</span>` : ''}</div>
  <div class="mid"><div class="nm">${esc(p.name)}</div><p class="pass-event">${esc(p.eventTitle)}</p></div><div class="perf" aria-hidden="true"><i></i></div>
  <div class="bot"><dl><div><dt>Code</dt><dd class="code">${esc(p.code)}</dd></div><div><dt>Date</dt><dd>${date}</dd></div><div><dt>Time</dt><dd>${esc(displayTime(p.time))}</dd></div><div><dt>Venue</dt><dd>${esc(p.venue)}</dd></div>${p.phone ? `<div class="wide"><dt>WhatsApp</dt><dd>${esc(p.phone)}</dd></div>` : ''}</dl></div></div></div>`;
}

export function confirmed(): string {
  const a = S.attendee;
  const ev = S.event;
  const date = ev ? longDate(ev.date) : 'the next gathering';
  const emailed =
    a && S.attendeeEmailed ? ` We’ve emailed your confirmation to ${esc(a.email)}.` : '';
  const first = a ? esc(a.name.split(' ')[0] ?? '') : '';
  const cancel = a?.cancelToken
    ? `<p class="cant">Can’t make it? <a class="link" href="#/cancel/${esc(a.cancelToken)}">Cancel my seat</a></p>`
    : '';
  return `<section class="cloth fade done">${pattern(14, 8, 6, 0.08)}${nav()}<div class="done-body">
 <div><h1>You’re in${a ? `, <em>${first}.</em>` : '.'}</h1><p class="lede">Your seat is held for ${date}.${emailed} We’ll send any updates by email and WhatsApp before the day.</p>
  <div class="actions">${btn('Back to home', 'home', 'primary')}<button class="link" data-route="support" type="button">Support the gathering</button></div>${cancel}</div>
 ${passCard({
   seat: a?.seat,
   name: a?.name ?? 'Guest',
   eventTitle: ev?.title ?? 'Just Pray',
   code: a?.code ?? 'JP-0000',
   date: ev?.date ?? '',
   time: ev?.time ?? '',
   venue: ev?.venue ?? '',
   phone: a?.phone,
 })}
</div></section>${footer()}`;
}
