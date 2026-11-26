import { IMG } from '../images';
import { pattern } from '../lib/cloth';
import { esc, longDate } from '../lib/format';
import { PHONE_PATTERN } from '../lib/validation';
import { capacity, ready, S, seatsLeft } from '../state';
import { footer, ICON, nav, when } from './common';

const fieldError = (name: string): string =>
  S.registerErrors[name]
    ? `<span class="err" id="${name}-err" role="alert">${esc(S.registerErrors[name])}</span>`
    : '';
const invalid = (name: string): string =>
  S.registerErrors[name] ? ` aria-invalid="true" aria-describedby="${name}-err"` : '';

export function register(): string {
  const a = S.attendee;
  const full = ready() && seatsLeft() <= 0;
  const closed = S.load === 'ready' && !S.event;
  const e = S.event;
  const name = a?.name ?? S.draft.name;
  const email = a?.email ?? S.draft.email;
  const panel = closed
    ? `<div class="panel"><h2>Reservations open soon.</h2><p>The next gathering hasn’t been announced yet. Please check back soon.</p></div>`
    : full
      ? `<div class="panel"><h2>This gathering is full.</h2><p>All ${capacity()} seats are reserved. Please check back for next month’s gathering.</p></div>`
      : `<form class="panel" data-form="register" novalidate><h2>Your details</h2><p>Fields marked * are required.</p>
  ${S.registerNotice ? `<div class="notice" role="status">${esc(S.registerNotice)}</div>` : ''}
  <div class="field"><label for="n">Full name *</label><input id="n" name="fullName" required autocomplete="name" value="${esc(name)}"${invalid('name')}>${fieldError('name')}</div>
  <div class="field"><label for="e">Email *</label><input id="e" name="email" type="email" required autocomplete="email" placeholder="you@example.com" value="${esc(email)}"${invalid('email')}>${fieldError('email')}</div>
  <div class="field"><label for="p">WhatsApp number *</label><input id="p" name="phone" type="tel" required inputmode="tel" autocomplete="tel" placeholder="+234 801 234 5678" pattern="${PHONE_PATTERN}" title="Enter a WhatsApp number with country code, for example +234 801 234 5678"${invalid('phone')}><span class="hint">We send venue details and a reminder on WhatsApp.</span>${fieldError('phone')}</div>
  <label class="check"><input type="checkbox" id="privacy" name="privacy" required><span>My details may be used to manage this gathering. *</span></label>${fieldError('privacy')}
  <label class="check"><input type="checkbox" id="updates" name="updates"><span>Tell me about future Just Pray gatherings.</span></label>
  <div class="hp" aria-hidden="true"><label for="hp-w">Website</label><input id="hp-w" name="website" tabindex="-1" autocomplete="off"></div>
  <button class="btn gold wide" type="submit" style="margin-top:24px"${S.busy ? ' disabled' : ''}>${S.busy ? 'Reserving…' : `Reserve my seat ${ICON.arrow}`}</button>
  <p class="fine">We use your details only to run Just Pray gatherings and never share or sell them. Email us to have them deleted.</p></form>`;
  return `<section class="cloth fade head">${pattern(14, 4, 3, 0.08)}${nav()}<div class="head-body"><div><h1>Reserve your seat.</h1><p class="lede">Free, with no ticket to buy. We’ll send the details by email and WhatsApp.</p></div>
 <div class="frame"><img src="${IMG.head1}" alt="" style="object-position:50% 24%"></div></div></section>
<div class="wrap"><section class="split"><div class="intro"><h2>Next gathering</h2>
  <dl class="kv"><div><dt>Date</dt><dd>${when(() => (e ? longDate(e.date) : 'To be announced'))}</dd></div><div><dt>Time</dt><dd>${when(() => esc(e?.time ?? ''))}</dd></div><div><dt>Venue</dt><dd>${when(() => esc(e?.venue ?? ''))}</dd></div><div><dt>Seats left</dt><dd>${when(() => `${seatsLeft()} of ${capacity()}`)}</dd></div></dl>
  <p>After you reserve, you’ll see your pass with your seat number and code.</p></div>
${panel}</section></div><div class="page-end"></div>${footer()}`;
}
