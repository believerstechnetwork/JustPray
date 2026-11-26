import { pattern } from '../lib/cloth';
import { esc, longDate } from '../lib/format';
import { S } from '../state';
import { btn, footer, nav } from './common';
import { passCard } from './confirmed';

/** "Cancel my seat", opened from the private link in a confirmation email or on the pass. */
export function cancel(): string {
  const c = S.cancel;
  const info = c.info;
  let body: string;

  if (c.load === 'loading') {
    body = `<div role="status"><div class="spin on-cloth"></div><p class="lede" style="text-align:center">Finding your seat…</p></div>`;
  } else if (!info) {
    body = `<div><h1>This link isn’t working.</h1><p class="lede">${esc(c.error || 'It may be from an older email.')} Reply to your confirmation email and we’ll sort it out.</p>
  <div class="actions">${btn('Back to home', 'home', 'white')}</div></div>`;
  } else {
    const first = esc(info.name.split(' ')[0] ?? '');
    const date = longDate(info.event.date);
    let text: string;
    if (info.status === 'active') {
      text = `<h1>Cancel your seat?</h1><p class="lede">Seat ${info.seat} for ${date} will go to someone else. You can reserve again while seats remain.</p>
  ${c.error ? `<p class="err on-cloth" role="alert">${esc(c.error)}</p>` : ''}
  <div class="actions"><button class="btn white" type="button" data-action="cancel-seat"${S.busy ? ' disabled' : ''}>${S.busy ? 'Cancelling…' : 'Cancel my seat'}</button><button class="link" data-route="home" type="button">Keep my seat</button></div>`;
    } else if (info.status === 'cancelled') {
      text = c.justCancelled
        ? `<h1>Seat cancelled.</h1><p class="lede">Thank you for letting us know, ${first}. Seat ${info.seat} is free for someone else, and we’ve sent you a note by email.</p>
  <div class="actions">${btn('Reserve again', 'register', 'gold')}<button class="link" data-route="home" type="button">Back to home</button></div>`
        : `<h1>Already cancelled.</h1><p class="lede">Seat ${info.seat} for ${date} was cancelled and is free for someone else.</p>
  <div class="actions">${btn('Reserve again', 'register', 'gold')}<button class="link" data-route="home" type="button">Back to home</button></div>`;
    } else {
      text = `<h1>Cancelling has closed.</h1><p class="lede">Seat ${info.seat} was for ${date}, which has passed or begun.</p>
  <div class="actions">${btn('See the next gathering', 'register', 'white')}</div>`;
    }
    body = `<div>${text}</div>
 ${passCard({
   seat: info.seat,
   name: info.name,
   eventTitle: info.event.title,
   code: info.code,
   date: info.event.date,
   time: info.event.time,
   venue: info.event.venue,
   void: info.status === 'cancelled',
 })}`;
  }

  return `<section class="cloth fade done">${pattern(14, 8, 6, 0.08)}${nav()}<div class="done-body">
 ${body}
</div></section>${footer()}`;
}
