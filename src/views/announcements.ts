import { announcementEmail, eventDates, themeLine, venueLine } from '../../server/emails';
import type { Announcement, AnnouncementForm, UpcomingEvent } from '../data/types';
import { IMG } from '../images';
import { displayTime, esc, parseTime } from '../lib/format';
import { pattern } from '../lib/cloth';
import { S } from '../state';
import { ICON } from './common';

/* Announcements: other BTN events (a conference, a retreat), separate from the monthly Just Pray
   gathering. Publishing one emails everyone who asked to hear about future events and lists it
   on the home page until it ends. */

type CardFields = Pick<
  UpcomingEvent,
  | 'title'
  | 'date'
  | 'endDate'
  | 'time'
  | 'theme'
  | 'themeTba'
  | 'venue'
  | 'venueTba'
  | 'summary'
  | 'imageUrl'
  | 'linkUrl'
  | 'linkLabel'
>;

const EXTERNAL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;

const when = (e: CardFields): string =>
  e.date
    ? [eventDates(e.date, e.endDate ?? undefined), e.time ? displayTime(e.time) : '']
        .filter(Boolean)
        .join(' · ')
    : 'Date to be set';

/** The theme line under the title: the theme in quotes, or "Theme to be announced". */
const theme = (e: CardFields): string => {
  const t = themeLine(e);
  if (!t) return '';
  return e.themeTba
    ? '<p class="up-theme tba">Theme to be announced</p>'
    : `<p class="up-theme">“${esc(t)}”</p>`;
};

const PIN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The date drawn large on the card: month, day (or days) and year. Decorative, since the line
 *  above the title says the same in words. */
export function dateBlock(date: string, endDate?: string | null): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  const end = endDate && endDate > date ? endDate.split('-').map(Number) : null;
  const [ey, em, ed] = end ?? [y, m, d];
  const mon = (i: number): string => MONTHS[i - 1] ?? '';
  const month = em === m && ey === y ? mon(m) : `${mon(m)} – ${mon(em ?? m)}`;
  const days = end ? `${d}–${ed}` : String(d);
  const year = ey === y ? String(y) : `${y}–${String(ey).slice(-2)}`;
  return `<span class="up-date" aria-hidden="true"><span class="m">${month}</span><span class="d">${days}</span><span class="y">${year}</span></span>`;
}

/** One event as the home page lists it. With a picture, the date sits on it as a small tag;
 *  without one, the date is drawn large on the cloth, so the card never looks half empty. */
export function upcomingCard(e: CardFields): string {
  // Only a web link becomes a button: the preview shows unsaved values, and a javascript: link
  // must never be clickable there.
  const link =
    e.linkUrl && /^https?:\/\//i.test(e.linkUrl)
      ? `<a class="btn small ghost" href="${esc(e.linkUrl)}" target="_blank" rel="noopener">${esc(e.linkLabel || 'Learn more')} ${EXTERNAL}<span class="sr"> (opens in a new tab)</span></a>`
      : '';
  const date = e.date ? dateBlock(e.date, e.endDate) : '';
  const face = e.imageUrl
    ? `<figure class="up-face up-img"><img src="${esc(e.imageUrl)}" alt="" loading="lazy">${date}</figure>`
    : `<div class="up-face cloth">${pattern(8, 5, 21, 0.09)}${date}</div>`;
  return `<article class="up-card">${face}
  <div class="up-body"><span class="up-when">${ICON.cal}${esc(when(e))}</span><h3>${esc(e.title || 'Event title')}</h3>${theme(e)}<p class="up-sum">${esc(e.summary || 'A sentence or two about the event.')}</p><span class="up-where">${PIN}${esc(venueLine(e) || 'Venue')}</span>${link}</div></article>`;
}

/** The home-page section, right after the next gathering. Nothing at all when no other events are
 *  coming up. The header's "Events" link jumps here. */
export function upcomingSection(): string {
  if (!S.upcoming.length) return '';
  return `<section class="upcoming" id="events" aria-labelledby="events-h"><div class="wrap"><div class="up-h"><h2 class="sec-h" id="events-h" tabindex="-1">Also from Believers Tech Network</h2><p>Other events from the community behind Just Pray.</p></div>
  <div class="up-list${S.upcoming.length === 1 ? ' one' : ''}">${S.upcoming.map(upcomingCard).join('')}</div></div></section>`;
}

/* ---------- organiser ---------- */

/** The email exactly as it will be sent, addressed to a sample person. */
export function emailPreviewHtml(f: AnnouncementForm): string {
  return announcementEmail({
    announcement: {
      ...f,
      title: f.title || 'Event title',
      date: f.date || lagosToday(),
      venue: f.venue || (f.venueTba ? '' : 'Venue'),
      theme: f.theme ?? undefined,
      subject: f.subject || 'Subject',
      endDate: f.endDate ?? undefined,
      time: f.time ?? undefined,
      imageUrl: f.imageUrl ?? undefined,
      linkUrl: f.linkUrl ?? undefined,
      linkLabel: f.linkLabel ?? undefined,
    },
    name: 'Ada Obi',
    email: 'ada@example.com',
    siteUrl: location.origin,
    unsubscribeUrl: '#',
  }).html;
}

/** The preview pane's content: the email in a frame, or the card as the site shows it. */
export function previewInner(): string {
  const a = S.ann;
  if (a.view === 'site')
    return `<div class="up-preview">${upcomingCard({ ...a.form, imageUrl: a.form.imageUrl })}</div>`;
  return `<iframe class="mail" title="Email preview" srcdoc="${esc(emailPreviewHtml(a.form))}"></iframe>`;
}

const PHOTOS: ReadonlyArray<[keyof typeof IMG, string]> = [
  ['t3', 'Attendees outside the venue'],
  ['t1', 'Speaker at a lectern'],
  ['s2', 'Worship'],
  ['hero', 'A crowd at BTN Conference'],
];
const photoUrl = (k: keyof typeof IMG): string => new URL(IMG[k], location.origin).href;

/** Today's date (YYYY-MM-DD) in Lagos, where the events are. */
const lagosToday = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

const people = (n: number): string =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? 'person' : 'people'}`;

const num = (n: number): string => n.toLocaleString('en-GB');
/** Sending is finished once every email is delivered or closed without delivery. */
const sending = (x: Announcement): boolean => x.sentCount + (x.unsentCount ?? 0) < x.recipients;

/** "Sending: 120 of 412 people" while the outbox works through it, then "Emailed to 412 people",
 *  or "Emailed 410 of 412 people · 2 not confirmed" when some had unsubscribed or failed (a
 *  failed send may still have been delivered, for example after a timeout, so it is not
 *  called "not sent"). */
const progress = (x: Announcement): string => {
  const unsent = x.unsentCount ?? 0;
  if (sending(x)) return `Sending: ${num(x.sentCount)} of ${people(x.recipients)}`;
  return unsent > 0
    ? `Emailed ${num(x.sentCount)} of ${people(x.recipients)} · ${num(unsent)} not confirmed`
    : `Emailed to ${people(x.recipients)}`;
};

const statusOf = (x: Announcement): string => {
  // Today in Lagos, as the public site uses: an event shows through its last Lagos day.
  const ended = (x.endDate ?? x.date) < lagosToday();
  if (x.status === 'draft') return '<span class="status mute">Draft</span>';
  return `<span class="status ${ended ? 'mute' : sending(x) ? 'warn' : 'ok'}">${ended ? 'Ended' : 'Published'}</span><small>${progress(x)}</small>`;
};

/** The mailing list: how many people announcements reach, and where they came from. */
function mailingList(): string {
  const { counts } = S.ann;
  return `<div class="block"><div class="block-h"><h2>Mailing list</h2><div class="btns"><button class="btn small ghost" type="button" data-action="ann-people">See everyone</button><button class="btn small ind" type="button" data-action="ann-import">Import from Excel</button></div></div>
  <div class="ml-nums"><div><strong>${counts.all.toLocaleString('en-GB')}</strong><span>on the list</span></div><div><strong>${counts.booked.toLocaleString('en-GB')}</strong><span>booked a seat and asked for updates</span></div><div><strong>${counts.imported.toLocaleString('en-GB')}</strong><span>imported from Excel</span></div></div>
  <p class="fine" style="margin-top:12px">Anyone who unsubscribes is taken off and never added back. Someone on both lists counts once.</p></div>`;
}

function peoplePanel(): string {
  const list = S.ann.people;
  const rows = (list ?? [])
    .map(
      (p) =>
        `<tr><td data-label="Name"><b>${esc(p.name || '–')}</b></td><td data-label="Email">${esc(p.email)}</td><td data-label="From">${esc(p.source)}</td></tr>`,
    )
    .join('');
  return `<p class="ann-back"><button class="link" type="button" data-action="ann-back">${ICON.back}Back to announcements</button></p>
<div class="block"><div class="block-h"><h2>Mailing list${list ? `<small> · ${people(list.length)}</small>` : ''}</h2><button class="btn small ind" type="button" data-action="ann-import">Import from Excel</button></div>
 ${S.ann.peopleFailed ? `<p class="err" role="alert">${esc(S.ann.error || 'The mailing list did not load.')}</p><button class="btn small ghost" type="button" data-action="ann-people">Try again</button>` : list === null ? '<div class="spin"></div>' : list.length ? `<div class="tw"><table class="cards"><thead><tr><th>Name</th><th>Email</th><th>From</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty"><h3>No one yet</h3><p>People who book a seat and tick “Tell me about future gatherings” appear here, and so do people you import.</p></div>'}</div>`;
}

function importPanel(): string {
  const im = S.ann.importing;
  const back = `<p class="ann-back"><button class="link" type="button" data-action="ann-back">${ICON.back}Back to announcements</button></p>`;
  if (!im)
    return `${back}<div class="block imp"><h2>Import from Excel</h2>
  <p>Choose an Excel (.xlsx) or CSV file with a column of email addresses, and names if you have them. The first row can be headings such as “Name” and “Email”.</p>
  <label class="btn ind imp-pick" for="imp-file">Choose a file</label><input id="imp-file" class="sr" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-ann-file>
  ${S.ann.error ? `<p class="err" role="alert">${esc(S.ann.error)}</p>` : ''}
  <p class="fine">Only import people who gave Believers Tech Network their email, for example past conference attendees. Everyone gets an unsubscribe link in each email.</p></div>`;
  if (im.result) {
    const r = im.result;
    return `${back}<div class="block imp"><h2>Import complete</h2>
  <ul class="imp-sum"><li><strong>${r.added.toLocaleString('en-GB')}</strong> added to the mailing list</li>${r.existing ? `<li><strong>${r.existing.toLocaleString('en-GB')}</strong> already on the list</li>` : ''}${r.unsubscribed ? `<li><strong>${r.unsubscribed.toLocaleString('en-GB')}</strong> unsubscribed earlier, so left off</li>` : ''}${r.invalid + im.invalid ? `<li><strong>${(r.invalid + im.invalid).toLocaleString('en-GB')}</strong> rows without a valid email</li>` : ''}</ul>
  <div class="ann-actions"><button class="btn ind" type="button" data-action="ann-people">See the mailing list</button><button class="link" type="button" data-action="ann-back">Back to announcements</button></div></div>`;
  }
  const sample = im.contacts
    .slice(0, 6)
    .map(
      (c) =>
        `<tr><td data-label="Name">${esc(c.name || '–')}</td><td data-label="Email">${esc(c.email)}</td></tr>`,
    )
    .join('');
  return `${back}<form class="block imp" data-form="import"><h2>Check the list</h2>
  <p><b>${esc(im.file)}</b>: ${people(im.contacts.length)} with a valid email${im.duplicates ? `, ${im.duplicates} repeated ${im.duplicates === 1 ? 'row' : 'rows'} counted once` : ''}${im.invalid ? `, ${im.invalid} ${im.invalid === 1 ? 'row' : 'rows'} without a valid email left out` : ''}.</p>
  ${im.contacts.length ? `<div class="tw"><table class="cards"><thead><tr><th>Name</th><th>Email</th></tr></thead><tbody>${sample}</tbody></table></div>${im.contacts.length > 6 ? `<p class="fine">and ${people(im.contacts.length - 6)} more.</p>` : ''}` : ''}
  <div class="field"><label for="imp-label">Label for this list</label><input id="imp-label" name="label" maxlength="80" value="${esc(im.label)}" placeholder="BTN Conference 2026 attendees"><span class="hint">Shown in the mailing list as where these people came from.</span></div>
  ${S.ann.error ? `<p class="err" role="alert">${esc(S.ann.error)}</p>` : ''}
  <div class="ann-actions"><button class="btn ind" type="submit"${S.busy || !im.contacts.length ? ' disabled' : ''}>${S.busy ? 'Importing…' : `Import ${people(im.contacts.length)}`}</button><button class="link" type="button" data-action="ann-import">Choose another file</button></div></form>`;
}

function list(): string {
  const a = S.ann;
  if (a.panel === 'people') return peoplePanel();
  if (a.panel === 'import') return importPanel();
  const rows = (a.list ?? [])
    .map(
      (x) =>
        `<div class="ann-row">${x.imageUrl ? `<img src="${esc(x.imageUrl)}" alt="">` : '<span class="ann-ph"></span>'}<div class="ann-t"><b>${esc(x.title)}</b><small>${esc(when(x))} · ${esc(venueLine(x))}</small></div><div class="ann-s">${statusOf(x)}</div><button class="btn small ghost" type="button" data-ann-edit="${x.id}">${x.status === 'draft' ? 'Edit' : 'Open'}</button></div>`,
    )
    .join('');
  return `<div class="block"><div class="block-h"><h2>Other BTN events</h2><button class="btn small ind" type="button" data-action="ann-new">New announcement</button></div>
  ${a.notice ? `<p class="fine" role="status" style="margin:0 0 6px">${esc(a.notice)}</p>` : ''}
  <p class="fine" style="margin:0 0 6px">For events beyond the monthly gathering, such as a conference. Publishing one emails your mailing list and lists the event on the home page until it ends.</p>
  ${
    a.list === null
      ? a.loadFailed
        ? `<p class="err" role="alert">${esc(a.error || 'The announcements could not be loaded.')}</p><button class="btn small ghost" type="button" data-action="ann-retry">Try again</button>`
        : '<div class="spin"></div>'
      : rows ||
        '<div class="empty"><h3>No announcements yet</h3><p>Announce a conference or another BTN event to your mailing list.</p></div>'
  }</div>
  ${mailingList()}`;
}

const val = (v: string | null | undefined): string => esc(v ?? '');

function editor(): string {
  const a = S.ann;
  const f = a.form;
  const current = typeof a.editing === 'number' ? a.list?.find((x) => x.id === a.editing) : null;
  const published = current?.status === 'published';
  const seg = (name: string, value: string, label: string, on: boolean) =>
    `<button type="button" id="ann-${name}-${value}" data-ann-${name}="${value}" aria-pressed="${on}">${label}</button>`;
  const photos = PHOTOS.map(([k, alt]) => {
    const url = photoUrl(k);
    return `<button type="button" data-ann-photo="${esc(url)}" aria-pressed="${f.imageUrl === url}" aria-label="Use photo: ${alt}"><img src="${IMG[k]}" alt=""></button>`;
  }).join('');
  const until = f.date ? eventDates(f.endDate ?? f.date) : 'the event ends';
  return `<p class="ann-back"><button class="link" type="button" data-action="ann-back">${ICON.back}All announcements</button></p>
<div class="ann-edit">
 <form class="block ann-form" data-form="announcement" novalidate>
  <h2>${published ? esc(current?.title ?? '') : a.editing === 'new' ? 'New announcement' : 'Edit draft'}</h2>
  ${published && current ? `<div class="notice" role="note">${progress(current)}. Changes here update the home page only; the email has already gone out.</div>` : ''}
  <h3>The event</h3>
  <div class="field"><label for="an-title">Title</label><input id="an-title" name="title" required maxlength="120" value="${val(f.title)}" placeholder="BTN Conference 2027"></div>
  <div class="formgrid"><div class="field"><label for="an-date">Date</label><input id="an-date" name="date" type="date" required value="${val(f.date)}"></div><div class="field"><label for="an-end">Last day <span class="opt">(optional)</span></label><input id="an-end" name="endDate" type="date" value="${val(f.endDate)}"></div></div>
  <div class="formgrid"><div class="field"><label for="an-time">Start time <span class="opt">(optional)</span></label><input id="an-time" name="time" type="time" value="${val(f.time ? parseTime(f.time) : '')}"></div><div class="field"><label for="an-venue">${f.venueTba ? 'City <span class="opt">(optional)</span>' : 'Venue'}</label><input id="an-venue" name="venue" maxlength="200" value="${val(f.venue)}" placeholder="${f.venueTba ? 'Lagos' : 'Landmark Centre, Lagos, or Online'}"><label class="check tba"><input type="checkbox" id="an-vtba" name="venueTba" data-ann-tba${f.venueTba ? ' checked' : ''}><span>Venue to be announced</span></label></div></div>
  <div class="field"><label for="an-theme">Theme <span class="opt">(optional)</span></label><input id="an-theme" name="theme" maxlength="160" value="${val(f.themeTba ? '' : f.theme)}" placeholder="Building with purpose"${f.themeTba ? ' disabled' : ''}><label class="check tba"><input type="checkbox" id="an-ttba" name="themeTba" data-ann-tba${f.themeTba ? ' checked' : ''}><span>Theme to be announced</span></label></div>
  <div class="field"><label for="an-sum">Summary</label><textarea id="an-sum" name="summary" rows="2" maxlength="280" required>${val(f.summary)}</textarea><span class="hint">One or two sentences, shown on the site and as the inbox preview line.</span></div>
  <div class="field"><span class="flabel" id="an-pic-l">Picture <span class="opt">(optional)</span></span><div class="ann-photos" role="group" aria-labelledby="an-pic-l">${photos}<button type="button" data-ann-photo="" aria-pressed="${!f.imageUrl}" class="none">None</button></div>
  <label class="sr" for="an-img">Picture link</label><input id="an-img" name="imageUrl" value="${val(f.imageUrl)}" placeholder="Or paste a picture link: https://…"></div>
  <h3>Button</h3>
  <div class="formgrid"><div class="field"><label for="an-ll">Button text</label><input id="an-ll" name="linkLabel" maxlength="40" value="${val(f.linkLabel)}" placeholder="Register"></div><div class="field"><label for="an-lu">Button link <span class="opt">(optional)</span></label><input id="an-lu" name="linkUrl" type="url" value="${val(f.linkUrl)}" placeholder="https://conference.example.org"></div></div>
  <h3>Email</h3>
  <div class="field"><label for="an-subj">Subject</label><input id="an-subj" name="subject" required maxlength="150" value="${val(f.subject)}" placeholder="Save the date: BTN Conference 2027"></div>
  <div class="field"><label for="an-msg">Message</label><textarea id="an-msg" name="message" rows="9" maxlength="5000" required>${val(f.message)}</textarea><span class="hint">{first name} becomes each person’s first name. Leave a blank line between paragraphs. **Bold** and links work.</span></div>
  ${a.error ? `<p class="err" role="alert">${esc(a.error)}</p>` : ''}${a.notice ? `<p class="fine" role="status">${esc(a.notice)}</p>` : ''}
  ${
    published
      ? `<div class="ann-actions"><button class="btn ind" type="submit"${S.busy ? ' disabled' : ''}>Save changes</button></div>`
      : `<div class="ann-test"><label for="an-test">Send a test to</label><div><input id="an-test" type="email" value="${esc(a.testTo)}" placeholder="you@example.com"><button class="btn small ghost" type="button" data-action="ann-test"${S.busy ? ' disabled' : ''}>Send test</button></div></div>
  <div class="ann-aud">${ICON.users}<p>Publishing emails your mailing list (you choose who on the next step) and lists it on the home page until ${esc(until)}.</p></div>
  <div class="ann-actions"><button class="btn ind" type="button" id="ann-publish-btn" data-action="ann-publish"${S.busy ? ' disabled' : ''}>Publish…</button><button class="btn ghost" type="submit"${S.busy ? ' disabled' : ''}>Save draft</button>${typeof a.editing === 'number' ? '<button class="link" type="button" data-action="ann-delete">Delete draft</button>' : ''}</div>`
  }
 </form>
 <div class="ann-preview" aria-label="Preview"><div class="ann-tabs"><div class="seg" role="group" aria-label="Preview of">${seg('view', 'email', 'Email', a.view === 'email')}${seg('view', 'site', 'On the site', a.view === 'site')}</div>
  <div class="seg" role="group" aria-label="Screen">${seg('device', 'laptop', 'Laptop', a.device === 'laptop')}${seg('device', 'phone', 'Phone', a.device === 'phone')}</div></div>
  <div id="ann-frame" class="ann-frame ${a.device}">${previewInner()}</div>
  ${a.view === 'email' ? `<p class="fine">Subject: <b id="ann-subj">${esc(f.subject || '…')}</b></p>` : ''}</div>
</div>
${a.confirming ? confirmDialog() : ''}`;
}

/** How many people the chosen lists reach (someone on both counts once). */
export function sendCount(): number {
  const { send, counts } = S.ann;
  return send.booked && send.imported
    ? counts.all
    : send.booked
      ? counts.booked
      : send.imported
        ? counts.imported
        : 0;
}

function confirmDialog(): string {
  const a = S.ann;
  const n = sendCount();
  const box = (k: 'booked' | 'imported', label: string, count: number) =>
    `<label class="check"><input type="checkbox" id="ann-send-${k}" data-ann-send="${k}"${a.send[k] ? ' checked' : ''}><span>${label} <b>(${count.toLocaleString('en-GB')})</b></span></label>`;
  const days = Math.ceil(n / Math.max(1, a.dailyLimit));
  return `<div class="share-bd"><div class="share" role="dialog" aria-modal="true" aria-labelledby="ann-c-h"><h3 id="ann-c-h" tabindex="-1">Publish “${esc(a.form.title)}”?</h3>
  <p>Send the email to:</p>
  <div class="ann-send">${box('booked', 'People who booked a seat and asked for updates', a.counts.booked)}${box('imported', 'People imported from Excel', a.counts.imported)}</div>
  <p>It will be emailed to <b>${people(n)}</b> and appear on the home page.${days > 1 ? ` To stay within the daily email limit, sending takes about ${days} days.` : ''} An email cannot be called back once sent.</p>
  ${a.error ? `<p class="err" role="alert">${esc(a.error)}</p>` : ''}
  <div class="actions"><button class="btn ind" type="button" data-action="ann-confirm"${S.busy || n === 0 ? ' disabled' : ''}>${S.busy ? 'Publishing…' : n === 0 ? 'Choose who to send to' : `Publish and email ${n.toLocaleString('en-GB')}`}</button><button class="link" type="button" data-action="ann-cancel" data-dialog-close${S.busy ? ' disabled' : ''}>Cancel</button></div></div></div>`;
}

export function announcementsTab(): string {
  return S.ann.editing === null ? list() : editor();
}
