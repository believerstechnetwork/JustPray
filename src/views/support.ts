import { DEMO_MODE } from '../config';
import { esc, money } from '../lib/format';
import { MIN_CONTRIBUTION } from '../lib/validation';
import { torn } from '../lib/tear';
import { S } from '../state';
import { btn, footer, nav, ovFlat, ovHeadSide, photoBg } from './common';

function panel(): string {
  const h = '<h3>Make a contribution</h3>';
  if (S.step === 'choose')
    return `<form data-form="support" novalidate>${h}<p>Optional. Attendance is free either way.</p>
   <div class="amounts">${[2000, 5000, 10000].map((n) => `<button type="button" data-amount="${n}" aria-pressed="${S.amount === n}">${money(n)}</button>`).join('')}</div>
   <div class="field"><label for="amt">Amount (₦)</label><input id="amt" name="amount" type="number" min="${MIN_CONTRIBUTION}" step="1" required value="${S.amount}"></div>
   <div class="field"><label for="se">Email for your receipt</label><input id="se" name="email" type="email" required placeholder="you@example.com" value="${esc(S.email)}"></div>
   ${S.supportError ? `<p class="err" role="alert">${esc(S.supportError)}</p>` : ''}
   <button class="btn dark wide" type="submit">Pay by bank transfer</button>
   <p class="fine">Payments are handled by Paystack on the live site.</p></form>`;
  if (S.step === 'details')
    return `<div>${h}<p>Transfer the exact amount to the temporary account below.</p>
   <dl class="kv" style="margin-top:0"><div><dt>Amount</dt><dd><b>${money(S.amount)}</b></dd></div><div><dt>Bank</dt><dd>Shown at checkout</dd></div><div><dt>Account number</dt><dd>Shown at checkout</dd></div><div><dt>Account name</dt><dd>Shown at checkout</dd></div><div><dt>Expires</dt><dd>Shown at checkout</dd></div></dl>
   <div class="notice">Demo: no real account exists here. Do not transfer money.</div>
   <button class="btn dark wide" data-action="verify" type="button">I've sent it</button>
   <button class="link" data-action="reset" type="button" style="margin-top:8px">Change amount</button></div>`;
  if (S.step === 'checking')
    return `<div role="status">${h}<div class="spin"></div><p>Checking with Paystack…</p></div>`;
  return `<div><h3>Waiting for confirmation</h3><p>We haven't received a confirmed transfer yet. On the live site the contribution stays pending until Paystack confirms the amount and reference.</p>
  <button class="btn ghost wide" data-action="verify" type="button">Check again</button>
  ${DEMO_MODE ? `<button class="link" data-route="payment" type="button" style="margin-top:10px">See the confirmed-payment screen</button><div class="notice">That screen is a design example. Viewing it does not mean any money arrived.</div>` : ''}</div>`;
}

export function support(): string {
  return `${nav()}
<section class="head green photo-bg" ${photoBg('head2', '50% 22%', ovHeadSide)}><h1>Help cover the cost of the room.</h1><p class="lede">Every gathering is free. Giving is optional and does not affect your seat. Contributions go to venue, equipment and hospitality.</p></section>
<section class="split"><div class="intro"><h2>How it works</h2>
<ol class="steps"><li><b>1</b><div><strong>Pick an amount</strong><span>Give what you want to. The minimum is ₦${MIN_CONTRIBUTION}.</span></div></li><li><b>2</b><div><strong>Send a bank transfer</strong><span>Paystack issues a temporary account for that exact amount.</span></div></li><li><b>3</b><div><strong>Get a receipt</strong><span>We confirm only after Paystack verifies the payment.</span></div></li></ol></div>${torn(41, 'panel', panel())}</section>${footer()}`;
}

export function payment(): string {
  return `${nav()}
<section class="done green photo-bg" ${photoBg('doneB', '50% 25%', ovFlat(84))}><div><h1>Thank you.</h1><p class="lede">Your contribution helps keep the gathering free for everyone who comes. This is a design example of the confirmed-payment screen.</p>
<div class="actions">${btn('Back to home', 'home', 'ghost-w')}<button class="link" data-route="support" type="button">Back to support</button></div></div>
${torn(
  53,
  'pass',
  `<div class="top"><p class="small-note" style="margin:0">Receipt</p><div class="lead2">${money(S.amount)}</div></div><div class="bot"><dl class="kv"><div><dt>Method</dt><dd>Bank transfer</dd></div><div><dt>Reference</dt><dd class="code">JP-EXAMPLE</dd></div><div><dt>Status</dt><dd>Paid (example)</dd></div><div><dt>Paid to</dt><dd>Just Pray, Believers Tech Network</dd></div></dl></div>`,
)}</section>${footer()}`;
}
