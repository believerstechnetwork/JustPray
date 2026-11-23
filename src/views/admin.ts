import { CAPACITY } from '../config';
import { esc, longDate, money, monthName } from '../lib/format';
import { reserved, S, seatsLeft, store, type AdminTab } from '../state';
import { demoBanner } from './common';
import { IMG } from '../images';

const TABS: ReadonlyArray<[AdminTab, string]> = [
  ['overview', 'Overview'],
  ['attendees', 'Attendees'],
  ['contributions', 'Contributions'],
  ['events', 'Event'],
];

function overview(): string {
  const bars = [6, 9, 7, 14, 11, 22, 17];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const mx = Math.max(...bars);
  return `<div class="nums"><div><span>Seats reserved</span><strong>${reserved()}<small> / ${CAPACITY}</small></strong></div><div><span>Seats left</span><strong>${seatsLeft()}</strong></div><div><span>Contributions</span><strong>₦245k</strong><small>29 supporters (sample)</small></div></div>
  <div class="block"><div class="block-h"><h2>${esc(S.event.title)}</h2><button class="btn small ghost" data-tab="events" type="button">Edit event</button></div>
  <dl class="kv" style="margin-top:0"><div><dt>Date</dt><dd>${longDate(S.event.date)}</dd></div><div><dt>Time</dt><dd>${esc(S.event.time)}</dd></div><div><dt>Venue</dt><dd>${esc(S.event.venue)}</dd></div></dl></div>
  <div class="block"><div class="block-h"><h2>Reservations by day</h2><small>Last 7 days, sample data</small></div>
  <div class="chart" role="img" aria-label="Reservations per day: ${days.map((d, i) => `${d} ${bars[i]}`).join(', ')}">${bars.map((v) => `<div class="${v === mx ? 'max' : ''}">${v}<i style="height:${(v / mx) * 100}%"></i></div>`).join('')}</div>
  <div class="axis">${days.map((d) => `<span>${d}</span>`).join('')}</div></div>`;
}

function attendees(): string {
  const real = store.listReservations().map((r) => ({ n: r.name, e: r.email }));
  const rows = [
    ...real,
    { n: 'Chidinma Eze', e: 'chidinma@example.com' },
    { n: 'Femi Adeyemi', e: 'femi@example.com' },
    { n: 'Ngozi Umeh', e: 'ngozi@example.com' },
    { n: 'Ibrahim Lawal', e: 'ibrahim@example.com' },
  ];
  return `<div class="block"><div class="block-h"><h2>${reserved()} reservations</h2><small>Sample records plus reservations made in this browser</small></div><div class="tw"><table><thead><tr><th>Name</th><th>Gathering</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.n)}</b><br><small>${esc(r.e)}</small></td><td>${monthName(S.event.date)}</td><td><span class="tag ok">Confirmed</span></td></tr>`).join('')}</tbody></table></div></div>`;
}

function contributions(): string {
  return `<div class="nums"><div><span>Verified</span><strong>₦245k</strong></div><div><span>Supporters</span><strong>29</strong></div><div><span>Pending</span><strong>2</strong></div></div>
  <div class="block"><div class="block-h"><h2>Ledger</h2><small>Sample data</small></div><div class="tw"><table><thead><tr><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody><tr><td class="code">JP-EXAMPLE-001</td><td>${money(10000)}</td><td><span class="tag ok">Verified</span></td></tr><tr><td class="code">JP-EXAMPLE-002</td><td>${money(5000)}</td><td><span class="tag ok">Verified</span></td></tr><tr><td class="code">JP-EXAMPLE-003</td><td>${money(2000)}</td><td><span class="tag">Pending</span></td></tr></tbody></table></div></div><p class="fine">In production, entries come only from Paystack's verified callbacks, never from a button in the browser.</p>`;
}

function events(): string {
  return `<div class="block"><div class="block-h"><h2>Edit gathering</h2></div>
   <form data-form="event"><div class="field"><label for="ft">Title</label><input id="ft" required name="title" value="${esc(S.event.title)}"></div>
   <div class="formgrid"><div class="field"><label for="fd">Date</label><input id="fd" type="date" required name="date" value="${esc(S.event.date)}"></div><div class="field"><label for="ftm">Time</label><input id="ftm" required name="time" value="${esc(S.event.time)}"></div></div>
   <div class="field"><label for="fv">Venue</label><input id="fv" required name="venue" value="${esc(S.event.venue)}"></div>
   <button class="btn dark" type="submit">Save changes</button>${S.eventSaved ? ' <span role="status" class="fine">Saved.</span>' : ''}</form></div><p class="fine">Changes appear on the public pages. They are stored in this browser only until a backend is connected.</p>`;
}

export function admin(): string {
  const body = { overview, attendees, contributions, events }[S.tab]();
  const title = TABS.find(([k]) => k === S.tab)?.[1] ?? '';
  return `${demoBanner()}<section class="admin"><aside class="side"><div class="brand"><img class="btn-logo" src="${IMG.logo}" alt="Believers Tech Network"></div><div class="sub">Organiser</div>
  <nav aria-label="Organiser">${TABS.map(([k, n]) => `<button class="t" type="button" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${n}</button>`).join('')}</nav>
  <button class="t back" type="button" data-route="home" style="width:100%">Back to public site</button></aside>
  <main class="main"><p class="small-note">${esc(S.event.title)}</p><h1>${title}</h1>${body}</main></section>`;
}
