import { pattern } from '../lib/cloth';
import { esc } from '../lib/format';
import { S } from '../state';
import { btn, footer, nav } from './common';

/** "Unsubscribe", opened from the link at the foot of an announcement. One click, no sign-in. */
export function unsubscribe(): string {
  const u = S.unsub;
  const body =
    u.state === 'done'
      ? `<h1>You’re unsubscribed.</h1><p class="lede">You won’t get emails about other BTN events again. Seat confirmations for Just Pray gatherings you book still come as usual.</p>
  <div class="actions">${btn('Back to home', 'home', 'white')}</div>`
      : u.state === 'error'
        ? `<h1>This link isn’t working.</h1><p class="lede">${esc(u.error || 'It may be from an older email.')} Reply to the email and we’ll take you off the list.</p>
  <div class="actions">${btn('Back to home', 'home', 'white')}</div>`
        : `<h1>Unsubscribe?</h1><p class="lede">You’ll stop getting emails about other Believers Tech Network events, such as conferences.</p>
  <div class="actions"><button class="btn white" type="button" data-action="unsub-confirm"${S.busy ? ' disabled' : ''}>${S.busy ? 'Unsubscribing…' : 'Unsubscribe'}</button><button class="link" data-route="home" type="button">Keep getting them</button></div>`;
  return `<section class="cloth fade done">${pattern(14, 8, 6, 0.08)}${nav()}<div class="done-body unsub"><div>${body}</div></div></section>${footer()}`;
}
