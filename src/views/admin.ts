import type { AdminData, Contribution, Currency } from '../data/types';
import { esc, longDate, money } from '../lib/format';
import { pattern } from '../lib/cloth';
import { ICON } from './common';
import { S, type AdminTab } from '../state';

const TABS: ReadonlyArray<[AdminTab, string]> = [
  ['overview', 'Overview'],
  ['attendees', 'Attendees'],
  ['contributions', 'Contributions'],
  ['events', 'Event'],
];

const when = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Africa/Lagos',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const shortMoney = (n: number, cur: Currency = 'NGN'): string => {
  const sym = cur === 'USD' ? '$' : '₦';
  return n >= 1_000_000
    ? `${sym}${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
    : n >= 10_000
      ? `${sym}${Math.round(n / 1000)}k`
      : money(n, cur);
};

/** The exact amount under a shortened figure; nothing when the figure is already exact. */
const exact = (n: number, cur: Currency): string =>
  shortMoney(n, cur) === money(n, cur) ? '' : `<small>${money(n, cur)}</small>`;

/** "₦245k + $120", leaving out a currency with nothing in it. */
const both = (t: Record<Currency, number>, short = true): string => {
  const f = short ? shortMoney : money;
  const parts = (['NGN', 'USD'] as const).filter((c) => t[c] > 0).map((c) => f(t[c], c));
  return parts.length ? parts.join(' + ') : f(0, 'NGN');
};

const weekdayOf = (isoDate: string): string =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });

function overview(d: AdminData): string {
  const cap = d.event?.capacity ?? 0;
  const bars = d.byDay.map((b) => b.count);
  const mx = Math.max(1, ...bars);
  const warnings = [
    !d.email && 'Email is not set up, so reservation confirmations are not being sent.',
    !d.banks.NGN &&
      !d.banks.USD &&
      'Bank details are not set up, so the Support page cannot take contributions.',
  ].filter(Boolean);
  return `${warnings.map((w) => `<div class="notice" role="note">${w}</div>`).join('')}
  <div class="nums"><div><span>Seats</span><strong>${d.reserved}<small> of ${cap}</small></strong><div class="bar"><i style="width:${cap ? Math.min(100, (d.reserved / cap) * 100) : 0}%"></i></div><small>${Math.max(0, cap - d.reserved)} left</small></div><div><span>Contributions confirmed</span><strong>${both(d.totals.confirmed)}</strong><small>${d.totals.supporters} supporter${d.totals.supporters === 1 ? '' : 's'}${d.totals.pendingCount ? ` · ${both(d.totals.pending, false)} awaiting check` : ''}</small></div></div>
  ${
    d.event
      ? `<div class="block"><div class="block-h"><h2>${esc(d.event.title)}</h2><button class="btn small ghost" data-tab="events" type="button">Edit event</button></div>
  <dl class="kv" style="margin-top:0"><div><dt>Date</dt><dd>${longDate(d.event.date)}</dd></div><div><dt>Time</dt><dd>${esc(d.event.time)}</dd></div><div><dt>Venue</dt><dd>${esc(d.event.venue)}</dd></div></dl></div>`
      : ''
  }
  <div class="block"><div class="block-h"><h2>Reservations by day</h2><small>Last 7 days, Lagos time</small></div>
  <div class="chart" role="img" aria-label="Reservations per day: ${d.byDay.map((b) => `${weekdayOf(b.date)} ${b.count}`).join(', ')}">${bars.map((v) => `<div class="${v === mx && v > 0 ? 'max' : ''}">${v}<i style="height:${(v / mx) * 100}%"></i></div>`).join('')}</div>
  <div class="axis">${d.byDay.map((b) => `<span>${weekdayOf(b.date)}</span>`).join('')}</div></div>`;
}

function attendees(d: AdminData): string {
  const rows = d.reservations
    .map(
      (r) =>
        `<tr><td data-label="Name"><b>${esc(r.name)}</b><br><small>${esc(r.email)} · ${esc(r.phone)}</small></td><td class="code" data-label="Code">${esc(r.code)}</td><td data-label="Reserved">${when(r.createdAt)}</td><td data-label="Email">${r.emailSent ? '<span class="status ok">Sent</span>' : '<span class="status mute">Not sent</span>'}</td></tr>`,
    )
    .join('');
  return `<div class="block"><div class="block-h"><h2>${d.reserved} reservation${d.reserved === 1 ? '' : 's'}</h2><a class="btn small ghost" href="/api/admin/reservations.csv" download>Download CSV</a></div>
  ${d.reservations.length ? `<div class="tw"><table class="cards"><thead><tr><th>Name</th><th>Code</th><th>Reserved</th><th>Email</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><h3>No reservations yet</h3><p>People who reserve a seat appear here, with their code and contact details.</p><button class="btn small ghost" data-action="share" type="button">Share the booking link</button></div>'}</div>`;
}

const statusTag = (c: Contribution): string =>
  c.status === 'confirmed'
    ? '<span class="status ok">Confirmed</span>'
    : c.status === 'rejected'
      ? '<span class="status mute">Not received</span>'
      : c.markedSentAt
        ? '<span class="status warn">Check bank</span>'
        : '<span class="status mute">Not marked sent</span>';

const actions = (c: Contribution): string =>
  c.status === 'pending'
    ? `<button class="btn small ind" type="button" data-contrib="${c.id}" data-status="confirmed">Confirm</button> <button class="btn small ghost" type="button" data-contrib="${c.id}" data-status="rejected">Not received</button>`
    : `<button class="link" type="button" data-contrib="${c.id}" data-status="pending">Undo</button>`;

function contributions(d: AdminData): string {
  const t = d.totals;
  const rows = d.contributions
    .map(
      (c) =>
        `<tr><td class="code" data-label="Reference">${esc(c.reference)}</td><td data-label="From"><b>${esc(c.name)}</b><br><small>${esc(c.email)} · ${when(c.createdAt)}</small></td><td data-label="Amount">${money(c.amount, c.currency)}</td><td data-label="Status">${statusTag(c)}</td><td class="acts">${actions(c)}</td></tr>`,
    )
    .join('');
  return `<div class="nums"><div><span>Confirmed naira</span><strong>${shortMoney(t.confirmed.NGN, 'NGN')}</strong>${exact(t.confirmed.NGN, 'NGN')}</div><div><span>Confirmed dollars</span><strong>${shortMoney(t.confirmed.USD, 'USD')}</strong>${exact(t.confirmed.USD, 'USD')}</div><div><span>Awaiting check</span><strong>${t.pendingCount}</strong><small>${both(t.pending, false)} · ${t.supporters} supporter${t.supporters === 1 ? '' : 's'} confirmed</small></div></div>
  <div class="block"><div class="block-h"><h2>Ledger</h2><small>Newest first</small></div>
  ${d.contributions.length ? `<div class="tw"><table class="cards"><thead><tr><th>Reference</th><th>From</th><th>Amount</th><th>Status</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><h3>No contributions yet</h3><p>Gifts appear here once someone shows the bank details; confirm each one against your statement.</p><button class="btn small ghost" data-route="support" type="button">Open the Support page</button></div>'}</div>
  <p class="fine">Match each transfer in the bank statement by its reference and amount, then press Confirm. Only confirmed contributions count toward the totals, and naira and dollars are totalled separately. "Check bank" means the giver pressed "I've sent it"; "Not marked sent" means they saw the details but did not confirm sending.</p>`;
}

function events(d: AdminData): string {
  const e = d.event ?? { title: '', date: '', time: '', venue: '', capacity: 120 };
  return `<div class="block"><div class="block-h"><h2>Edit gathering</h2></div>
   <form data-form="event"><div class="field"><label for="ft">Title</label><input id="ft" required name="title" value="${esc(e.title)}"></div>
   <div class="formgrid"><div class="field"><label for="fd">Date</label><input id="fd" type="date" required name="date" value="${esc(e.date)}"></div><div class="field"><label for="ftm">Time</label><input id="ftm" required name="time" value="${esc(e.time)}" placeholder="4:00 PM WAT"></div></div>
   <div class="formgrid"><div class="field"><label for="fv">Venue</label><input id="fv" required name="venue" value="${esc(e.venue)}"></div><div class="field"><label for="fc">Seats</label><input id="fc" type="number" min="${Math.max(1, d.reserved)}" step="1" required name="capacity" value="${e.capacity}"></div></div>
   ${S.adminError ? `<p class="err" role="alert">${esc(S.adminError)}</p>` : ''}
   <button class="btn ind" type="submit" style="margin-top:22px"${S.busy ? ' disabled' : ''}>${S.busy ? 'Saving…' : 'Save changes'}</button>${S.adminNotice ? ` <span role="status" class="fine">${esc(S.adminNotice)}</span>` : ''}</form></div><p class="fine">Changes show on the public pages straight away. Confirmation emails use these details.</p>`;
}

function login(): string {
  return `<section class="login"><div class="cloth l">${pattern(8, 8, 7, 0.12)}<button class="brand" data-route="home" type="button" aria-label="Just Pray, home">Just Pray</button><h1>Organisers</h1><p>Sign in to see reservations and contributions.</p></div>
  <div class="r"><form data-form="login" class="panel"><h2>Sign in</h2><div class="field"><label for="ap">Password</label><input id="ap" name="password" type="password" required autocomplete="current-password"></div>
  ${S.adminError ? `<p class="err" role="alert">${esc(S.adminError)}</p>` : ''}
  <button class="btn ind wide" type="submit" style="margin-top:24px"${S.busy ? ' disabled' : ''}>${S.busy ? 'Signing in…' : 'Sign in'}</button>
  <p style="text-align:center;margin-top:10px"><button class="link" data-route="home" type="button">Back to public site</button></p></form></div></section>`;
}

const TAB_ICONS: Record<AdminTab, string> = {
  overview: ICON.grid,
  attendees: ICON.users,
  contributions: ICON.gift,
  events: ICON.cal,
};

export function admin(): string {
  if (S.adminAuthed === false) return `<main>${login()}</main>`;
  const d = S.admin;
  const notice =
    S.adminError && S.tab !== 'events'
      ? `<p class="err" role="alert">${esc(S.adminError)}</p>`
      : '';
  const body = d
    ? notice + { overview, attendees, contributions, events }[S.tab](d)
    : S.adminError
      ? `<p class="err" role="alert">${esc(S.adminError)}</p><button class="btn small ghost" data-action="admin-reload" type="button">Try again</button>`
      : '<div role="status"><div class="spin"></div><p style="text-align:center">Loading…</p></div>';
  const title = TABS.find(([k]) => k === S.tab)?.[1] ?? '';
  return `<section class="admin"><aside class="cloth side">${pattern(3, 9, 31, 0.08)}<div class="brand">Just Pray</div><div class="sub">Organiser</div>
  <nav aria-label="Organiser" style="display:contents">${TABS.map(([k, n]) => `<button class="t" type="button" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${TAB_ICONS[k]}${n}</button>`).join('')}</nav><span class="gap"></span>
  <button class="t" type="button" data-route="home">${ICON.back}Back to public site</button>
  <button class="t" type="button" data-action="logout">${ICON.out}Sign out</button></aside>
  <main class="main"><h1>${title}</h1>${body}</main></section>`;
}
