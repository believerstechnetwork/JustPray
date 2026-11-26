import { passCloth, pattern } from '../lib/cloth';
import { esc, longDate } from '../lib/format';
import { tearPolygon } from '../lib/tear';
import { S } from '../state';
import { btn, footer, nav } from './common';

export function confirmed(): string {
  const a = S.attendee;
  const ev = S.event;
  const date = ev ? longDate(ev.date) : 'the next gathering';
  const emailed =
    a && S.attendeeEmailed ? ` We’ve emailed your confirmation to ${esc(a.email)}.` : '';
  const first = a ? esc(a.name.split(' ')[0] ?? '') : '';
  return `<section class="cloth fade done">${pattern(14, 8, 6, 0.08)}${nav()}<div class="done-body">
 <div><h1>You’re in${a ? `, <em>${first}.</em>` : '.'}</h1><p class="lede">Your seat is held for ${date}.${emailed} We’ll send any updates by email and WhatsApp before the day.</p>
  <div class="actions">${btn('Back to home', 'home', 'gold')}<button class="link" data-route="support" type="button">Support the gathering</button></div></div>
 <div class="pass-wrap"><div class="pass" style="clip-path:${tearPolygon(41)}">
  <div class="top">${passCloth()}<span class="adm">Admit one</span>${a ? `<span class="seatno num"><small>SEAT</small>${a.seat}</span>` : ''}</div>
  <div class="mid"><div class="nm">${esc(a?.name ?? 'Guest')}</div><p class="pass-event">${esc(ev?.title ?? 'Just Pray')}</p></div><div class="perf" aria-hidden="true"><i></i></div>
  <div class="bot"><dl><div><dt>Code</dt><dd class="code">${esc(a?.code ?? 'JP-0000')}</dd></div><div><dt>Date</dt><dd>${date}</dd></div><div><dt>Time</dt><dd>${esc(ev?.time ?? '')}</dd></div><div><dt>Venue</dt><dd>${esc(ev?.venue ?? '')}</dd></div>${a?.phone ? `<div class="wide"><dt>WhatsApp</dt><dd>${esc(a.phone)}</dd></div>` : ''}</dl></div></div></div>
</div></section>${footer()}`;
}
