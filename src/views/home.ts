import { CAPACITY } from '../config';
import { IMG } from '../images';
import { dayOfMonth, esc, monthYear, weekday } from '../lib/format';
import { torn } from '../lib/tear';
import { S, seatsLeft } from '../state';
import { btn, footer, nav, ovHeadSide, ovSide, photoBg, seatWall } from './common';

export function home(): string {
  return `${nav()}
<section class="hero green photo-bg" ${photoBg('hero', '72% 28%', ovSide)}><div class="hero-in">
 ${torn(
   11,
   '',
   `<p class="small-note">Free monthly prayer gathering in Lagos</p><h1>Once a month, we stop and pray.</h1><p class="lede">Just Pray brings people who work in technology together for an afternoon of Scripture and prayer. It is free to attend.</p><div class="actions">${btn('Reserve a seat', 'register', 'dark')}<button class="link" data-route="support" type="button">Support the gathering</button></div>`,
 )}
 <div class="lock" aria-hidden="true">Just<br>Pray<i></i></div>
</div><span class="credit">Photo: BTN Conference 2025</span></section>
<section class="when"><div class="date-big"><div class="day">${dayOfMonth(S.event.date)}</div><div class="date-txt"><b>${weekday(S.event.date)}<br>${monthYear(S.event.date)}</b><span>${esc(S.event.time)}</span><span>${esc(S.event.venue)}</span></div></div>
 <div class="gp"><p>Every light is a seat. Reserve yours and it turns on.</p>${seatWall()}<div class="row"><span><b>${seatsLeft()}</b>seats left</span><span>${CAPACITY} in total</span></div><button class="btn wide" data-route="register" type="button">Reserve a seat</button></div></section>
<section class="burden"><figure class="bphoto"><img src="${IMG.head2}" style="object-position:50% 78%" alt="A man with his hands behind his head and his eyes closed" loading="lazy"></figure>
 <div class="btext"><h2>The burden</h2><p class="lead2">People who build technology carry a lot, and prayer is usually the first thing to get squeezed out.</p><p>Deadlines, layoffs, long commutes, family needs and the pressure to keep up leave little room to stop. Many of us believe God answers prayer and still go for weeks without praying with anyone.</p><p>We carry this burden for each other: that believers in tech would not face their work alone, or pray alone.</p></div></section>
<section class="goal"><div class="gtext"><h2>The goal</h2><p class="lead2">One protected afternoon each month where tech workers in Lagos stand in the gap together.</p>
 <ul class="how"><li><b>Gather</b><span>Up to ${CAPACITY} people, once a month, free to attend.</span></li><li><b>Pray</b><span>Scripture first, then personal and group prayer for our work, homes and city.</span></li><li><b>Keep going</b><span>Leave with a prayer rhythm for the weeks in between.</span></li></ul>
 <div class="actions"><button class="btn" data-route="register" type="button">Reserve a seat</button><button class="btn ghost-d" data-action="share" type="button">Share the goal</button></div></div>
 <figure class="gphoto"><img src="${IMG.doneA}" style="object-position:50% 72%" alt="A man with his hands raised in worship" loading="lazy"></figure></section>
<section class="do"><h2>What we do when we gather</h2><div class="tiles">
 <div class="tile"><figure><img src="${IMG.t1}" style="--p:50% 22%" alt="A man praying at a lectern at BTN Conference 2026" loading="lazy"></figure><h3>Read Scripture</h3><p>We start from the Word and the invitation to seek God wholeheartedly.</p></div>
 <div class="tile"><figure><img src="${IMG.t2}" style="--p:50% 30%" alt="A man in prayer with his head bowed" loading="lazy"></figure><h3>Pray together</h3><p>Time for personal prayer, prayer in groups, and standing in the gap for others.</p></div>
 <div class="tile"><figure><img src="${IMG.t3}" style="--p:60% 50%" alt="Attendees in BTN shirts talking outside the venue" loading="lazy"></figure><h3>Go back to work</h3><p>We return to our jobs and homes more committed to praying through the month.</p></div>
</div></section>
<section class="verse green on-dark photo-bg" ${photoBg('verse', '50% 30%', ovHeadSide)}><blockquote>“And I sought for a man among them, that should make up the hedge, and stand in the gap before me for the land.”<cite>Ezekiel 22:30 (KJV)</cite></blockquote></section>
<section class="close"><h2>Free to attend. ${seatsLeft()} seats left.</h2>${btn('Reserve a seat', 'register', 'dark')}</section>${footer()}`;
}
