import { esc, longDate } from '../lib/format';
import { torn } from '../lib/tear';
import { PHONE_PATTERN } from '../lib/validation';
import { capacity, ready, S, seatsLeft } from '../state';
import { footer, nav, ovHeadSide, photoBg, when } from './common';

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
  return `${nav()}
<section class="head green photo-bg" ${photoBg('head1', '50% 24%', ovHeadSide)}><h1>Reserve your seat.</h1><p class="lede">No ticket and no payment. Give us a few details so we can send you the gathering information and plan seating.</p></section>
<section class="split"><div class="intro">
  <h2>Next gathering</h2>
  <dl class="kv"><div><dt>Date</dt><dd>${when(() => longDate(e!.date))}</dd></div><div><dt>Time</dt><dd>${when(() => esc(e!.time))}</dd></div><div><dt>Venue</dt><dd>${when(() => esc(e!.venue))}</dd></div><div><dt>Cost</dt><dd>Free</dd></div><div><dt>Seats left</dt><dd>${when(() => `${seatsLeft()} of ${capacity()}`)}</dd></div></dl>
  <ol class="steps"><li><b>1</b><div><strong>Fill in the form</strong><span>Name, email and WhatsApp number are required.</span></div></li><li><b>2</b><div><strong>See your pass</strong><span>It shows your reservation code.</span></div></li><li><b>3</b><div><strong>Get the details</strong><span>We send venue and arrival details by email and WhatsApp.</span></div></li></ol>
</div>
${torn(
  23,
  'panel',
  closed
    ? `<h3>Reservations open soon.</h3><p>The next gathering hasn't been announced yet. Please check back soon.</p>`
    : full
      ? `<h3>This gathering is full.</h3><p>All ${capacity()} seats are reserved. Please check back for next month's gathering.</p>`
      : `<form data-form="register" novalidate><h3>Your details</h3><p>Fields marked * are required.</p>
  ${S.registerNotice ? `<div class="notice" role="status">${esc(S.registerNotice)}</div>` : ''}
  <div class="field"><label for="n">Full name *</label><input id="n" name="fullName" required autocomplete="name" value="${esc(a?.name ?? '')}"${invalid('name')}>${fieldError('name')}</div>
  <div class="field"><label for="e">Email *</label><input id="e" name="email" type="email" required autocomplete="email" placeholder="you@example.com" value="${esc(a?.email ?? '')}"${invalid('email')}>${fieldError('email')}</div>
  <div class="field"><label for="p">WhatsApp number *</label><input id="p" name="phone" type="tel" required inputmode="tel" autocomplete="tel" placeholder="+234 801 234 5678" pattern="${PHONE_PATTERN}" title="Enter a WhatsApp number with country code, for example +234 801 234 5678"${invalid('phone')}><span class="hint">We send your reminder and venue details on WhatsApp.</span>${fieldError('phone')}</div>
  <label class="check"><input type="checkbox" name="privacy" required><span>My details may be used to manage this gathering. *</span></label>${fieldError('privacy')}
  <label class="check"><input type="checkbox" name="updates"><span>Tell me about future Just Pray gatherings.</span></label>
  <div class="hp" aria-hidden="true"><label for="hp-w">Website</label><input id="hp-w" name="website" tabindex="-1" autocomplete="off"></div>
  <button class="btn dark wide" type="submit" style="margin-top:8px"${S.busy ? ' disabled' : ''}>${S.busy ? 'Reserving…' : 'Reserve my seat'}</button>
  <p class="fine">We use your details only to run Just Pray gatherings, and we never share or sell them. Email us to have them deleted.</p></form>`,
)}
</section>${footer()}`;
}
