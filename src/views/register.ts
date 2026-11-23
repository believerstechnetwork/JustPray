import { CAPACITY } from '../config';
import { esc, longDate } from '../lib/format';
import { torn } from '../lib/tear';
import { PHONE_PATTERN } from '../lib/validation';
import { S, seatsLeft } from '../state';
import { footer, nav, ovHeadSide, photoBg } from './common';

const fieldError = (name: string): string =>
  S.registerErrors[name]
    ? `<span class="err" id="${name}-err" role="alert">${esc(S.registerErrors[name])}</span>`
    : '';
const invalid = (name: string): string =>
  S.registerErrors[name] ? ` aria-invalid="true" aria-describedby="${name}-err"` : '';

export function register(): string {
  const a = S.attendee;
  const full = seatsLeft() <= 0;
  return `${nav()}
<section class="head green photo-bg" ${photoBg('head1', '50% 24%', ovHeadSide)}><h1>Reserve your seat.</h1><p class="lede">No ticket and no payment. Give us a few details so we can send you the gathering information and plan seating.</p></section>
<section class="split"><div class="intro">
  <h2>Next gathering</h2>
  <dl class="kv"><div><dt>Date</dt><dd>${longDate(S.event.date)}</dd></div><div><dt>Time</dt><dd>${esc(S.event.time)}</dd></div><div><dt>Venue</dt><dd>${esc(S.event.venue)}</dd></div><div><dt>Cost</dt><dd>Free</dd></div><div><dt>Seats left</dt><dd>${seatsLeft()} of ${CAPACITY}</dd></div></dl>
  <ol class="steps"><li><b>1</b><div><strong>Fill in the form</strong><span>Name, email and WhatsApp number are required.</span></div></li><li><b>2</b><div><strong>See your pass</strong><span>It shows your reservation code.</span></div></li><li><b>3</b><div><strong>Get the details</strong><span>We send venue and arrival details by email and WhatsApp.</span></div></li></ol>
</div>
${torn(
  23,
  'panel',
  full
    ? `<h3>This gathering is full.</h3><p>All ${CAPACITY} seats are reserved. Please check back for next month's gathering.</p>`
    : `<form data-form="register" novalidate><h3>Your details</h3><p>Fields marked * are required.</p>
  ${S.registerNotice ? `<div class="notice" role="status">${esc(S.registerNotice)}</div>` : ''}
  <div class="field"><label for="n">Full name *</label><input id="n" name="fullName" required autocomplete="name" value="${esc(a?.name ?? '')}"${invalid('name')}>${fieldError('name')}</div>
  <div class="field"><label for="e">Email *</label><input id="e" name="email" type="email" required autocomplete="email" placeholder="you@example.com" value="${esc(a?.email ?? '')}"${invalid('email')}>${fieldError('email')}</div>
  <div class="field"><label for="p">WhatsApp number *</label><input id="p" name="phone" type="tel" required inputmode="tel" autocomplete="tel" placeholder="+234 801 234 5678" pattern="${PHONE_PATTERN}" title="Enter a WhatsApp number with country code, for example +234 801 234 5678"${invalid('phone')}><span class="hint">We send your reminder and venue details on WhatsApp.</span>${fieldError('phone')}</div>
  <label class="check"><input type="checkbox" name="privacy" required><span>My details may be used to manage this gathering. *</span></label>${fieldError('privacy')}
  <label class="check"><input type="checkbox" name="updates"><span>Tell me about future Just Pray gatherings.</span></label>
  <button class="btn dark wide" type="submit" style="margin-top:8px">Reserve my seat</button></form>`,
)}
</section>${footer()}`;
}
