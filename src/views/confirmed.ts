import { esc, longDate } from '../lib/format';
import { torn } from '../lib/tear';
import { capacity, reserved, S } from '../state';
import { btn, footer, nav, ovFlat, photoBg, seatWall } from './common';

export function confirmed(): string {
  const a = S.attendee;
  const ev = S.event;
  const date = ev ? longDate(ev.date) : 'the next gathering';
  const emailed =
    a && S.attendeeEmailed ? ` We've emailed your confirmation to ${esc(a.email)}.` : '';
  return `${nav()}
<section class="done green photo-bg" ${photoBg('doneA', '50% 30%', ovFlat(82))}><div><h1>You're in${a ? ', ' + esc(a.name.split(' ')[0]) : ''}.</h1><p class="lede">Your seat is held for ${date}.${emailed} We'll send any updates by email and WhatsApp before the day.</p>
<div class="actions">${btn('Back to home', 'home', 'ghost-w')}<button class="link" data-route="support" type="button">Support the gathering</button></div></div>
<div class="stack">${torn(
    37,
    'pass',
    `<div class="top"><p class="small-note" style="margin:0">Admit one · ${esc(ev?.title ?? 'Just Pray')}</p><div class="nm">${esc(a?.name ?? 'Guest')}</div></div><div class="bot"><dl class="kv"><div><dt>Code</dt><dd class="code">${esc(a?.code ?? 'JP-0000')}</dd></div><div><dt>Date</dt><dd>${date}</dd></div><div><dt>Time</dt><dd>${esc(ev?.time ?? '')}</dd></div><div><dt>Venue</dt><dd>${esc(ev?.venue ?? '')}</dd></div>${a?.phone ? `<div><dt>WhatsApp</dt><dd>${esc(a.phone)}</dd></div>` : ''}</dl></div>`,
  )}
<div class="gp"><p>${a ? 'Your seat is the white light.' : 'Every light is a seat.'} ${reserved()} of ${capacity()} reserved.</p>${seatWall()}</div></div></section>${footer()}`;
}
