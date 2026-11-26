import { pattern } from '../lib/cloth';
import { esc } from '../lib/format';
import { S } from '../state';
import { btn, footer, ICON, nav } from './common';

/* Email preferences, opened from "Unsubscribe or manage your emails" at the foot of an
   announcement. The link itself identifies the person, so there is nothing to sign in to. */

function card(): string {
  const u = S.unsub;
  const on = u.subscribed;
  return `<div class="prefs" aria-live="polite">
  <span class="prefs-k">Emails to</span><p class="prefs-email">${esc(u.email)}</p>
  <div class="prefs-row"><span class="prefs-ic">${ICON.megaphone}</span><div><b>Announcements of BTN events</b><span>Conferences and other events from Believers Tech Network.</span></div><span class="pill ${on ? 'on' : 'off'}">${on ? 'On' : 'Off'}</span></div>
  ${
    on
      ? `<button class="btn ind wide" type="button" data-action="unsub-confirm"${S.busy ? ' disabled' : ''}>${S.busy ? 'Unsubscribing…' : 'Unsubscribe'}</button>`
      : `<button class="btn ghost wide" type="button" data-action="unsub-undo"${S.busy ? ' disabled' : ''}>${S.busy ? 'Saving…' : 'Resubscribe'}</button>`
  }
  ${u.error ? `<p class="err" role="alert">${esc(u.error)}</p>` : ''}
  <p class="fine">Seat confirmations for Just Pray gatherings you book are always sent.</p></div>`;
}

export function unsubscribe(): string {
  const u = S.unsub;
  let left: string;
  let right = '';
  if (u.load === 'loading') {
    left = `<div role="status"><div class="spin on-cloth"></div><p class="lede">Finding your settings…</p></div>`;
  } else if (u.load === 'error') {
    left = `<h1>This link isn’t working.</h1><p class="lede">${esc(u.error || 'It may be from an older email.')} Reply to the email and we’ll take you off the list.</p>
  <div class="actions">${btn('Back to home', 'home', 'white')}</div>`;
  } else {
    left =
      u.changed === 'unsubscribed'
        ? `<h1>You’re unsubscribed.</h1><p class="lede">You won’t get announcements of BTN events any more. Changed your mind? You can resubscribe here at any time.</p>`
        : u.changed === 'resubscribed'
          ? `<h1>Welcome back.</h1><p class="lede">You’ll hear about the next BTN events again.</p>`
          : `<h1>Email preferences</h1><p class="lede">Choose what Believers Tech Network emails you about. One click, and it takes effect straight away.</p>`;
    left += `<div class="actions">${btn('Back to home', 'home', 'white')}</div>`;
    right = card();
  }
  return `<section class="cloth fade done">${pattern(14, 8, 6, 0.08)}${nav()}<div class="done-body prefs-body"><div>${left}</div>${right}</div></section>${footer()}`;
}
