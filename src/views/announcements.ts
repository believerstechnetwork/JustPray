import { announcementEmail, eventDates, themeLine, venueLine } from '../../server/emails';
import type { Announcement, AnnouncementForm, UpcomingEvent } from '../data/types';
import { IMG } from '../images';
import { displayTime, esc, parseTime } from '../lib/format';
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

/** One event as the home page lists it. */
export function upcomingCard(e: CardFields): string {
  const link = e.linkUrl
    ? `<a class="btn small ghost" href="${esc(e.linkUrl)}" target="_blank" rel="noopener">${esc(e.linkLabel || 'Learn more')} ${EXTERNAL}<span class="sr"> (opens in a new tab)</span></a>`
    : '';
  return `<article class="up-card">${e.imageUrl ? `<figure class="up-img"><img src="${esc(e.imageUrl)}" alt="" loading="lazy"></figure>` : ''}
  <div class="up-body"><span class="up-when">${ICON.cal}${esc(when(e))}</span><h3>${esc(e.title || 'Event title')}</h3>${theme(e)}<p>${esc(e.summary || 'A sentence or two about the event.')}</p><span class="up-where">${esc(venueLine(e) || 'Venue')}</span>${link}</div></article>`;
}

/** The home-page section. Nothing at all when no other events are coming up. */
export function upcomingSection(): string {
  if (!S.upcoming.length) return '';
  return `<section class="upcoming"><div class="wrap"><div class="up-h"><h2 class="sec-h">Also from Believers Tech Network</h2><p>Other events from the community behind Just Pray.</p></div>
  <div class="up-list${S.upcoming.length === 1 ? ' one' : ''}">${S.upcoming.map(upcomingCard).join('')}</div></div></section>`;
}

/* ---------- organiser ---------- */

/** The email exactly as it will be sent, addressed to a sample person. */
export function emailPreviewHtml(f: AnnouncementForm): string {
  return announcementEmail({
    announcement: {
      ...f,
      title: f.title || 'Event title',
      date: f.date || new Date().toISOString().slice(0, 10),
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

const statusOf = (x: Announcement): string => {
  const ended = (x.endDate ?? x.date) < new Date().toISOString().slice(0, 10);
  if (x.status === 'draft') return '<span class="status mute">Draft</span>';
  if (ended) return '<span class="status mute">Ended</span>';
  return `<span class="status ok">Published</span><small>Emailed to ${x.recipients} ${x.recipients === 1 ? 'person' : 'people'}</small>`;
};

function list(): string {
  const a = S.ann;
  const rows = (a.list ?? [])
    .map(
      (x) =>
        `<div class="ann-row">${x.imageUrl ? `<img src="${esc(x.imageUrl)}" alt="">` : '<span class="ann-ph"></span>'}<div class="ann-t"><b>${esc(x.title)}</b><small>${esc(when(x))} · ${esc(venueLine(x))}</small></div><div class="ann-s">${statusOf(x)}</div><button class="btn small ghost" type="button" data-ann-edit="${x.id}">${x.status === 'draft' ? 'Edit' : 'Open'}</button></div>`,
    )
    .join('');
  return `<div class="block"><div class="block-h"><h2>Other BTN events</h2><button class="btn small ind" type="button" data-action="ann-new">New announcement</button></div>
  <p class="fine" style="margin:0 0 6px">For events beyond the monthly gathering, such as a conference. Publishing one emails the <b>${a.audience}</b> ${a.audience === 1 ? 'person' : 'people'} who asked to hear about future events, and lists it on the home page until it ends.</p>
  ${a.list === null ? '<div class="spin"></div>' : rows || '<div class="empty"><h3>No announcements yet</h3><p>Announce a conference or another BTN event to everyone who asked to hear about them.</p></div>'}</div>`;
}

const val = (v: string | null | undefined): string => esc(v ?? '');

function editor(): string {
  const a = S.ann;
  const f = a.form;
  const current = typeof a.editing === 'number' ? a.list?.find((x) => x.id === a.editing) : null;
  const published = current?.status === 'published';
  const seg = (name: string, value: string, label: string, on: boolean) =>
    `<button type="button" data-ann-${name}="${value}" aria-pressed="${on}">${label}</button>`;
  const photos = PHOTOS.map(([k, alt]) => {
    const url = photoUrl(k);
    return `<button type="button" data-ann-photo="${esc(url)}" aria-pressed="${f.imageUrl === url}" aria-label="Use photo: ${alt}"><img src="${IMG[k]}" alt=""></button>`;
  }).join('');
  const until = f.date ? eventDates(f.endDate ?? f.date) : 'the event ends';
  return `<p class="ann-back"><button class="link" type="button" data-action="ann-back">${ICON.back}All announcements</button></p>
<div class="ann-edit">
 <form class="block ann-form" data-form="announcement" novalidate>
  <h2>${published ? esc(current?.title ?? '') : a.editing === 'new' ? 'New announcement' : 'Edit draft'}</h2>
  ${published ? `<div class="notice" role="note">Emailed to ${current?.recipients ?? 0} people. Changes here update the home page only; the email has already gone out.</div>` : ''}
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
      : `<div class="ann-aud">${ICON.users}<p>Publishing emails this to <b>${a.audience} ${a.audience === 1 ? 'person' : 'people'}</b> who asked to hear about future events, and lists it on the home page until ${esc(until)}.</p></div>
  <div class="ann-actions"><button class="btn ind" type="button" data-action="ann-publish"${S.busy ? ' disabled' : ''}>Publish…</button><button class="btn ghost" type="submit"${S.busy ? ' disabled' : ''}>Save draft</button>${typeof a.editing === 'number' ? '<button class="link" type="button" data-action="ann-delete">Delete draft</button>' : ''}</div>`
  }
 </form>
 <div class="ann-preview" aria-label="Preview"><div class="ann-tabs"><div class="seg" role="group" aria-label="Preview of">${seg('view', 'email', 'Email', a.view === 'email')}${seg('view', 'site', 'On the site', a.view === 'site')}</div>
  <div class="seg" role="group" aria-label="Screen">${seg('device', 'laptop', 'Laptop', a.device === 'laptop')}${seg('device', 'phone', 'Phone', a.device === 'phone')}</div></div>
  <div id="ann-frame" class="ann-frame ${a.device}">${previewInner()}</div>
  ${a.view === 'email' ? `<p class="fine">Subject: <b id="ann-subj">${esc(f.subject || '…')}</b></p>` : ''}</div>
</div>
${a.confirming ? confirmDialog() : ''}`;
}

function confirmDialog(): string {
  const a = S.ann;
  return `<div class="share-bd"><div class="share" role="dialog" aria-modal="true" aria-labelledby="ann-c-h"><h3 id="ann-c-h">Publish “${esc(a.form.title)}”?</h3>
  <p>It will be emailed to <b>${a.audience} ${a.audience === 1 ? 'person' : 'people'}</b> and appear on the home page. An email cannot be called back once sent.</p>
  <div class="actions"><button class="btn ind" type="button" data-action="ann-confirm"${S.busy ? ' disabled' : ''}>${S.busy ? 'Publishing…' : `Publish and email ${a.audience}`}</button><button class="link" type="button" data-action="ann-cancel">Cancel</button></div></div></div>`;
}

export function announcementsTab(): string {
  return S.ann.editing === null ? list() : editor();
}
