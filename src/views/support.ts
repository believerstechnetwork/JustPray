import { esc, money } from '../lib/format';
import { CONTRIBUTION_LIMITS, CURRENCY_SYMBOL } from '../lib/validation';
import { torn } from '../lib/tear';
import { PRESETS, S } from '../state';
import { footer, nav, ovHeadSide, photoBg } from './common';

const copyRow = (label: string, value: string, extra = ''): string =>
  `<div><dt>${label}</dt><dd><span class="copyval${extra}">${esc(value)}</span> <button class="copy" type="button" data-copy="${esc(value)}" aria-label="Copy ${label.toLowerCase()}">Copy</button></dd></div>`;

/** Every account that is set up, side by side, so givers can see both at a glance. */
function accounts(): string {
  const list = (['NGN', 'USD'] as const).flatMap((c) => {
    const b = S.banks[c];
    if (!b) return [];
    const title = c === 'NGN' ? 'Naira account (₦)' : 'Dollar account ($)';
    return [
      `<div class="acct"><h3>${title}</h3><dl class="kv">${copyRow('Bank', b.bankName)}${copyRow('Account number', b.accountNumber, ' code')}${copyRow('Account name', b.accountName)}${b.swiftCode ? copyRow('SWIFT code', b.swiftCode, ' code') : ''}</dl></div>`,
    ];
  });
  if (!list.length) return '';
  // Its own section (not the intro column, which phones hide) so every visitor sees it.
  return `<section class="acct-sec" aria-labelledby="acct-h"><h2 id="acct-h">Our accounts</h2><div class="accts">${list.join('')}</div>
  <p class="fine">Fill in the form above to get your own reference, then put it in the transfer description so we can match and confirm your gift.</p></section>`;
}

function panel(): string {
  const h = '<h3>Make a contribution</h3>';
  const err = S.supportError ? `<p class="err" role="alert">${esc(S.supportError)}</p>` : '';

  if (S.step === 'details' && S.bank)
    return `<div>${h}<p>Transfer <b>${money(S.amount, S.currency)}</b> to our ${S.currency === 'USD' ? 'dollar' : 'naira'} account below. Put the reference in the transfer description so we can match it.</p>
   <dl class="kv" style="margin-top:0">${copyRow('Amount', String(S.amount))}${copyRow('Bank', S.bank.bankName)}${copyRow('Account number', S.bank.accountNumber, ' code')}${copyRow('Account name', S.bank.accountName)}${S.bank.swiftCode ? copyRow('SWIFT code', S.bank.swiftCode, ' code') : ''}${copyRow('Reference', S.reference, ' code')}</dl>
   ${err}
   <button class="btn dark wide" data-action="sent" type="button"${S.busy ? ' disabled' : ''}>${S.busy ? 'Saving…' : "I've sent it"}</button>
   <button class="link" data-action="reset" type="button" style="margin-top:8px">Change amount</button></div>`;

  if (S.step === 'sent')
    return `<div role="status"><h3>Thank you, ${esc(S.giverName.split(' ')[0] ?? '')}.</h3><p>We'll confirm your contribution of <b>${money(S.amount, S.currency)}</b> once it shows in our account. Your reference is <b class="code">${esc(S.reference)}</b>.</p>
   <p class="fine">If you haven't sent it yet, you can still transfer to the same account with the same reference.</p>
   <button class="btn ghost wide" data-action="reset" type="button">Make another contribution</button></div>`;

  const offered = (['NGN', 'USD'] as const).filter((c) => S.banks[c]);
  if (S.load === 'ready' && offered.length === 0)
    return `<div>${h}<p>Bank details for contributions are being set up. Please check back soon.</p></div>`;

  const cur = S.currency;
  const toggle =
    offered.length > 1
      ? `<div class="amounts cur" role="group" aria-label="Currency">${offered.map((c) => `<button type="button" data-currency="${c}" aria-pressed="${cur === c}">${c === 'NGN' ? '₦ Naira' : '$ Dollars'}</button>`).join('')}</div>`
      : '';
  return `<form data-form="support" novalidate>${h}<p>Optional. Attendance is free either way.</p>
   ${toggle}<input type="hidden" name="currency" value="${cur}">
   <div class="amounts">${PRESETS[cur].map((n) => `<button type="button" data-amount="${n}" aria-pressed="${S.amount === n}">${money(n, cur)}</button>`).join('')}</div>
   <div class="field"><label for="amt">Amount (${CURRENCY_SYMBOL[cur]})</label><input id="amt" name="amount" type="number" min="${CONTRIBUTION_LIMITS[cur].min}" step="1" required value="${S.amount}"></div>
   <div class="field"><label for="sn">Name on your bank account</label><input id="sn" name="name" required autocomplete="name" value="${esc(S.giverName)}"><span class="hint">Helps us match your transfer.</span></div>
   <div class="field"><label for="se">Email</label><input id="se" name="email" type="email" required autocomplete="email" placeholder="you@example.com" value="${esc(S.email)}"></div>
   <div class="hp" aria-hidden="true"><label for="hp-s">Website</label><input id="hp-s" name="website" tabindex="-1" autocomplete="off"></div>
   ${err}
   <button class="btn dark wide" type="submit"${S.busy ? ' disabled' : ''}>${S.busy ? 'Getting details…' : 'Show bank details'}</button></form>`;
}

export function support(): string {
  return `${nav()}
<section class="head green photo-bg" ${photoBg('head2', '50% 22%', ovHeadSide)}><h1>Help cover the cost of the room.</h1><p class="lede">Every gathering is free. Giving is optional and does not affect your seat. Contributions go to venue, equipment and hospitality.</p></section>
<section class="split"><div class="intro"><h2>How it works</h2>
<ol class="steps"><li><b>1</b><div><strong>Pick an amount</strong><span>${S.banks.USD && S.banks.NGN ? `Give what you want to, in naira or dollars. The minimum is ₦${CONTRIBUTION_LIMITS.NGN.min} or $${CONTRIBUTION_LIMITS.USD.min}.` : `Give what you want to. The minimum is ${S.banks.USD ? `$${CONTRIBUTION_LIMITS.USD.min}` : `₦${CONTRIBUTION_LIMITS.NGN.min}`}.`}</span></div></li><li><b>2</b><div><strong>Send a bank transfer</strong><span>Use the reference we give you as the transfer description.</span></div></li><li><b>3</b><div><strong>We confirm it</strong><span>An organiser checks it against our bank statement.</span></div></li></ol></div>${torn(41, 'panel', panel())}</section>${accounts()}${footer()}`;
}
