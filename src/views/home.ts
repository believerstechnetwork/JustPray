import { IMG } from '../images';
import { motif, pattern } from '../lib/cloth';
import { dayOfMonth, esc, monthYear, weekday } from '../lib/format';
import { capacity, S, seatsLeft } from '../state';
import { btn, footer, ICON, nav, seatWall, when } from './common';

/** Date block for the next gathering, or a placeholder while it loads. */
function nextDate(): string {
  const e = S.event;
  if (!e)
    return `<div class="date-big"><div class="day">${S.load === 'loading' ? '…' : '–'}</div><div class="date-txt"><b>Next gathering</b><span>${S.load === 'loading' ? 'Loading details…' : 'Date to be announced'}</span></div></div>`;
  return `<div class="date-big"><div class="day num">${dayOfMonth(e.date)}</div><div class="date-txt"><b>${weekday(e.date)},<br>${monthYear(e.date)}</b><span>${esc(e.time)} · ${esc(e.venue)}</span></div></div>`;
}

/** The date tag on the hero photo, once the gathering is announced. */
function dateTag(): string {
  const e = S.event;
  if (!e) return '';
  const short = new Date(`${e.date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
  return `<div class="tag">${ICON.cal}<div><b>${short}</b><span>${esc(e.time)} · ${esc(e.venue)}</span></div></div>`;
}

/** The first step of reserving, right on the first screen. It carries the name and email to the
 *  Reserve page, which asks for the WhatsApp number and consent. */
const slip = (): string =>
  `<form class="slip" data-form="quick" aria-labelledby="slip-h"><h2 id="slip-h">Reserve your seat</h2>
  <div class="field"><label for="qn">Your name</label><input id="qn" name="fullName" autocomplete="name" value="${esc(S.draft.name)}"></div>
  <div class="field"><label for="qe">Email</label><input id="qe" name="email" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(S.draft.email)}"></div>
  <button class="btn gold" type="submit">Continue ${ICON.arrow}</button></form>`;

export function home(): string {
  return `<section class="cloth fade hero">${pattern(14, 8, 2, 0.08)}${nav()}
 <div class="hero-body"><div class="hero-copy"><h1>Once a month, we stop and <em>pray.</em></h1><p class="lede">Just Pray brings people who work in technology together for an afternoon of Scripture and prayer. It is free to attend.</p>
  <button class="link" data-route="support" type="button">Support the gathering</button></div>
  <div class="hero-photo"><div class="frame"><img src="${IMG.verse}" alt="A woman looking up in prayer" style="object-position:50% 30%"></div>${dateTag()}<span class="credit">Photo: BTN Conference 2025</span></div></div>
 ${slip()}</section>
<section class="when"><div class="wrap"><div><h2>The next gathering</h2>${nextDate()}</div>
 <div class="cloth seatcloth">${pattern(6, 6, 8, 0.06)}${seatWall()}<div class="row"><div class="count">${when(() => `${seatsLeft()} seats left`, 'Seats')}<small>Every light is a seat</small></div>${btn(`Reserve a seat ${ICON.arrow}`, 'register', 'gold')}</div></div></div></section>
<section class="burden"><div class="wrap"><div><h2 class="big">The burden</h2><p class="lead2">People who build technology carry a lot, and prayer is usually the first thing to get squeezed out.</p><p>Deadlines, layoffs, long commutes, family needs and the pressure to keep up leave little room to stop. Many of us believe God answers prayer and still go for weeks without praying with anyone.</p><p>We carry this burden for each other: that believers in tech would not face their work alone, or pray alone.</p></div>
 <figure class="pframe"><img src="${IMG.head2}" style="object-position:50% 78%" alt="A man with his hands behind his head and his eyes closed" loading="lazy"></figure></div></section>
<section class="cloth goal">${pattern(14, 7, 13, 0.07)}<div class="wrap"><figure class="frame"><img src="${IMG.doneA}" style="object-position:50% 72%" alt="A man with his hands raised in worship" loading="lazy"></figure>
 <div><h2 class="big">The goal</h2><p class="lead2">One protected afternoon each month where tech workers in Lagos stand in the gap together.</p>
 <ul class="how"><li><span class="m">${motif('rings')}</span><div><b>Gather</b><span>Up to ${capacity() || 120} people, once a month, free to attend.</span></div></li><li><span class="m">${motif('strands')}</span><div><b>Pray</b><span>Scripture first, then personal and group prayer for our work, homes and city.</span></div></li><li><span class="m">${motif('arcs')}</span><div><b>Keep going</b><span>Leave with a prayer rhythm for the weeks in between.</span></div></li></ul>
 ${btn('Reserve a seat', 'register', 'gold')}</div></div></section>
<section class="do"><div class="wrap"><h2 class="sec-h">What we do when we gather</h2><div class="tiles">
 <div class="tile"><figure class="pframe"><img src="${IMG.t1}" style="object-position:50% 22%" alt="A man praying at a lectern at BTN Conference 2026" loading="lazy"></figure><h3>Read Scripture</h3><p>We start from the Word and the invitation to seek God wholeheartedly.</p></div>
 <div class="tile"><figure class="pframe"><img src="${IMG.t2}" style="object-position:50% 30%" alt="A man in prayer with his head bowed" loading="lazy"></figure><h3>Pray together</h3><p>Time for personal prayer, prayer in groups, and standing in the gap for others.</p></div>
 <div class="tile"><figure class="pframe"><img src="${IMG.t3}" style="object-position:60% 50%" alt="Attendees in BTN shirts talking outside the venue" loading="lazy"></figure><h3>Go back to work</h3><p>We return to our jobs and homes more committed to praying through the month.</p></div>
</div></div></section>
<section class="cloth verse">${pattern(14, 6, 17, 0.22)}<div class="q"><blockquote>“And I sought for a man among them, that should make up the hedge, and stand in the gap before me for the land.”<cite>Ezekiel 22:30 (KJV)</cite></blockquote></div></section>
<section class="close"><h2>Free to attend.</h2>${btn(`Reserve a seat ${ICON.arrow}`, 'register', 'gold')}</section>${footer()}`;
}
