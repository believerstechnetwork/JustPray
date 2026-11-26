import './styles.css';
import { api, ApiError } from './api';
import { burst } from './lib/burst';
import { latestGuard } from './lib/latest';
import { validateContribution, validateRegistration } from './lib/validation';
import { handleShareClick, initShareKeys } from './share';
import type { Currency } from './data/types';
import {
  blankAnnouncement,
  PRESETS,
  ROUTES,
  S,
  type AdminTab,
  type Route,
  type Theme,
} from './state';
import { previewInner } from './views/announcements';
import { unsubscribe } from './views/unsubscribe';
import {
  ImportExpiredError,
  MAX_IMPORT_PEOPLE,
  importInBatches,
  readContactsFile,
  startImport,
} from './lib/contacts';
import { admin } from './views/admin';
import { cancel } from './views/cancel';
import { confirmed } from './views/confirmed';
import { home } from './views/home';
import { register } from './views/register';
import { support } from './views/support';

const views: Record<Route, () => string> = {
  home,
  register,
  confirmed,
  support,
  admin,
  cancel,
  unsubscribe,
};
const TITLES: Record<Route, string> = {
  home: 'Just Pray: a free monthly prayer gathering for people in tech',
  register: 'Reserve a seat · Just Pray',
  confirmed: 'Seat reserved · Just Pray',
  support: 'Support the gathering · Just Pray',
  admin: 'Organiser · Just Pray',
  cancel: 'Cancel your seat · Just Pray',
  unsubscribe: 'Unsubscribe · Just Pray',
};
const THEME_KEY = 'jp:theme';

const page = document.getElementById('page') as HTMLElement;
let renderedPage: Route | null = null;
/** The seat count arrives from page loads and from bookings; an older answer must not replace a newer one. */
const seatCount = latestGuard();
/** Bumped when the organiser saves the event, so a read that started earlier cannot undo the save. */
let eventVersion = 0;
/** Bumped on sign-out, so an organiser read that started before it cannot bring the data back. */
let adminGeneration = 0;

/** "#/cancel/abc" -> ['cancel', 'abc'] */
const hashParts = (): string[] => location.hash.replace(/^#\/?/, '').split('/');

const routeFromHash = (): Route => {
  const r = hashParts()[0] as Route;
  return ROUTES.includes(r) ? r : 'home';
};

const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Re-rendering replaces the page's HTML. Keep what the visitor typed and where the
 *  cursor was, so a data refresh or an error message never wipes a half-filled form. */
function snapshot(): { values: Map<string, string | boolean>; focus: string | null } {
  const values = new Map<string, string | boolean>();
  // File inputs are skipped: browsers do not let a page set a chosen file back.
  page.querySelectorAll<Field>('input[id]:not([type="file"]), textarea[id]').forEach((el) => {
    values.set(
      el.id,
      el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value,
    );
  });
  const active = document.activeElement;
  return { values, focus: active && page.contains(active) && active.id ? active.id : null };
}

function restore(snap: ReturnType<typeof snapshot>): void {
  snap.values.forEach((v, id) => {
    const el = document.getElementById(id) as Field | null;
    if (!el) return;
    if (typeof v === 'boolean' && el instanceof HTMLInputElement) el.checked = v;
    else if (typeof v === 'string' && el.type !== 'password') el.value = v;
  });
  if (snap.focus) document.getElementById(snap.focus)?.focus();
}

/** Set when a different form is opened in place (another announcement), so what was typed in
 *  the previous one is not carried over by the next render. */
let freshForm = false;

function render(): void {
  const snap = renderedPage === S.page && !freshForm ? snapshot() : null;
  freshForm = false;
  document.documentElement.dataset.mode = S.theme;
  document.title = TITLES[S.page];
  page.innerHTML = views[S.page]();
  const main = page.querySelector('main') ?? page.querySelector('section:not(.admin)');
  main?.setAttribute('id', 'main');
  if (snap) restore(snap);
  renderedPage = S.page;
  fitMailFrames();
}

/** Grow each email preview frame to the email's full height, so the whole email shows. */
function fitMailFrames(): void {
  page.querySelectorAll<HTMLIFrameElement>('iframe.mail').forEach((f) => {
    const fit = () => {
      const h = f.contentDocument?.documentElement.scrollHeight;
      if (h) f.style.height = `${h}px`;
    };
    f.addEventListener('load', fit, { once: true });
    fit();
  });
}

/** Navigate: sets the hash, which triggers a render via hashchange. */
function go(route: Route): void {
  if (routeFromHash() === route && S.page === route) render();
  else location.hash = `/${route}`;
}

/** Bumped each time a refresh puts a list on the page, so an older page load never replaces it. */
let upcomingApplied = 0;

async function loadPublic(): Promise<void> {
  S.load = 'loading';
  const ticket = seatCount.ticket();
  const eventAtStart = eventVersion;
  const upcomingAtStart = upcomingApplied;
  let switchedToUsd = false;
  try {
    const info = await api.publicInfo();
    if (eventAtStart === eventVersion) S.event = info.event;
    seatCount.applyRead(ticket, () => (S.reserved = info.reserved));
    S.banks = info.banks;
    // A refresh that landed after this load began holds a newer list; and null means the list
    // could not be read this time, so the one already shown stays.
    if (upcomingAtStart === upcomingApplied && info.upcoming) S.upcoming = info.upcoming;
    // Offer dollars by default only when there is no naira account.
    if (!S.banks.NGN && S.banks.USD && S.currency !== 'USD') {
      setCurrency('USD');
      switchedToUsd = true;
    }
    S.load = 'ready';
  } catch {
    S.load = 'error';
  }
  render();
  // render() keeps what was in the amount box; after a currency switch it must show the new default.
  if (switchedToUsd) {
    const amt = document.getElementById('amt') as HTMLInputElement | null;
    if (amt) amt.value = String(S.amount);
  }
}

async function loadAdmin(): Promise<void> {
  S.adminError = '';
  const ticket = seatCount.ticket();
  const generation = adminGeneration;
  const eventAtStart = eventVersion;
  try {
    const data = await api.adminData();
    // Signed out while this was in flight: drop it.
    if (generation !== adminGeneration) return;
    S.admin = data;
    S.adminAuthed = true;
    if (data.event && eventAtStart === eventVersion) S.event = data.event;
    const reservedNow = data.reserved;
    seatCount.applyRead(ticket, () => (S.reserved = reservedNow));
  } catch (e) {
    if (generation !== adminGeneration) return;
    if (e instanceof ApiError && e.status === 401) S.adminAuthed = false;
    else S.adminError = errorMessage(e);
  }
  if (S.page === 'admin') render();
}

/** Look up the seat behind a cancel link. Ignores the answer if another link was opened meanwhile. */
async function loadCancel(token: string): Promise<void> {
  S.cancel = { token, load: 'loading', info: null, error: '', justCancelled: false };
  try {
    const info = await api.cancelLookup(token);
    if (S.cancel.token !== token) return;
    S.cancel.info = info;
    S.cancel.load = 'ready';
  } catch (e) {
    if (S.cancel.token !== token) return;
    S.cancel.error = errorMessage(e);
    S.cancel.load = 'error';
  }
  if (S.page === 'cancel') render();
}

/** Load, or change, the email preferences behind an unsubscribe link. */
async function preferences(action?: 'unsubscribe' | 'resubscribe'): Promise<void> {
  const u = S.unsub;
  const token = u.token;
  // Only an action holds the busy flag; a lookup never takes it, so it never clears another
  // operation's.
  let ownsBusy = false;
  if (action) {
    if (S.busy) return;
    S.busy = ownsBusy = true;
    u.error = '';
    render();
  }
  try {
    const res = await api.preferences(token, action);
    if (S.unsub.token !== token) return;
    Object.assign(u, { load: 'ready', email: res.email, subscribed: res.subscribed });
    if (action) u.changed = action === 'unsubscribe' ? 'unsubscribed' : 'resubscribed';
  } catch (e) {
    if (S.unsub.token !== token) return;
    if (u.load === 'ready') u.error = errorMessage(e);
    else Object.assign(u, { load: 'error', error: errorMessage(e) });
  } finally {
    // Released even when the answer arrives for a link the page has since left; whatever page
    // is showing then is redrawn, so controls it drew disabled come back.
    if (ownsBusy) {
      S.busy = false;
      render();
    } else if (S.page === 'unsubscribe') render();
  }
}

/** Read a chosen Excel or CSV file in the browser, for the organiser to check before importing. */
let importReads = 0;
async function readImportFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  // Only the latest file chosen, in the import panel that chose it, shows its result: an earlier
  // read that finishes late, or one whose panel was left, changes nothing (but still frees busy).
  const read = ++importReads;
  const editor = annEditor;
  const current = (): boolean =>
    read === importReads && editor === annEditor && S.ann.panel === 'import';
  S.ann.error = '';
  S.busy = true;
  render();
  try {
    const parsed = await readContactsFile(file);
    if (current()) {
      S.ann.importing = {
        file: file.name,
        ...parsed,
        label: file.name.replace(/\.(xlsx|csv)$/i, ''),
        progress: null,
        result: null,
      };
      if (!parsed.contacts.length)
        S.ann.error =
          'No email addresses were found in that file. Check it has a column of emails.';
    }
  } catch {
    if (current())
      S.ann.error = 'That file could not be read. Save it as .xlsx or .csv and try again.';
  } finally {
    if (read === importReads) S.busy = false;
  }
  if (!current()) return render();
  freshForm = true;
  render();
}

async function submitImport(data: FormData): Promise<void> {
  const im = S.ann.importing;
  if (!im || S.busy) return;
  // The label is fixed once part of the list is saved, so every batch carries the same one.
  if (!im.progress?.done) im.label = String(data.get('label') ?? '').trim();
  if (im.contacts.length > MAX_IMPORT_PEOPLE) {
    S.ann.error = `Import up to ${MAX_IMPORT_PEOPLE.toLocaleString('en-GB')} people at a time. Split the sheet and import each part.`;
    return render();
  }
  S.busy = true;
  S.ann.error = '';
  render();
  // Sent in batches small enough for any request, however long or unusual the names are; the
  // counts add up to one result. If a batch fails, the batches before it stay saved and counted,
  // and pressing Import again sends only the rest.
  const progress = im.progress ?? startImport();
  im.progress = progress;
  const label = im.label || im.file;
  try {
    await importInBatches(im.contacts, progress, (batch, key) =>
      api.importContacts(batch, label, key),
    );
    im.result = progress.counts;
    im.progress = null;
    void loadAnnouncements();
  } catch (e) {
    if (e instanceof ImportExpiredError) {
      // Too old to resume with exact counts: the next press is a new import of the whole list.
      im.progress = null;
      S.ann.error =
        'This import stopped more than a day ago, so it can no longer be resumed. Press Import to import the whole list again as a new import; people saved earlier will show as already on the list.';
    } else if (progress.done) {
      const n = progress.done.toLocaleString('en-GB');
      const of = im.contacts.length.toLocaleString('en-GB');
      S.ann.error = `At least ${n} of ${of} people are saved; the import stopped before the rest. ${errorMessage(e)} Press Import again to send the rest; nobody is added twice.`;
      void loadAnnouncements();
    } else {
      // Kept even though nothing is known to be saved: the first batch may have been saved with
      // its reply lost, and sending it again under the same key gets back that batch's first result.
      S.ann.error = errorMessage(e);
    }
  }
  S.busy = false;
  render();
}

async function cancelSeat(): Promise<void> {
  const token = S.cancel.token;
  if (S.busy || !token) return;
  S.busy = true;
  S.cancel.error = '';
  render();
  try {
    const info = await api.cancel(token);
    if (S.cancel.token === token) {
      S.cancel.info = info;
      S.cancel.justCancelled = info.status === 'cancelled' && info.reserved !== undefined;
    }
    if (info.reserved !== undefined) {
      const left = info.reserved;
      seatCount.applyLatest(() => (S.reserved = left));
    }
    // A seat booked earlier in this visit no longer has a pass to show.
    if (info.status === 'cancelled' && S.attendee?.cancelToken === token) S.attendee = null;
  } catch (e) {
    S.cancel.error = errorMessage(e);
  }
  S.busy = false;
  render();
}

function applyRoute(): void {
  const route = routeFromHash();
  if (route === 'unsubscribe') {
    const token = hashParts()[1] ?? '';
    if (token !== S.unsub.token || !token || S.unsub.load === 'error') {
      S.unsub = { token, load: 'loading', email: '', subscribed: true, changed: null, error: '' };
      if (token) void preferences();
      else S.unsub.load = 'error';
    }
  }
  if (route === 'cancel') {
    const token = hashParts()[1] ?? '';
    if (!token)
      // "#/cancel" with nothing after it: there is nothing to look up.
      S.cancel = { token: '', load: 'error', info: null, error: '', justCancelled: false };
    else if (token !== S.cancel.token || S.cancel.load === 'error') void loadCancel(token);
  }
  // The confirmation page only makes sense after a reservation.
  S.page = route === 'confirmed' && !S.attendee ? 'register' : route;
  S.menu = false;
  S.supportError = '';
  if (S.page === 'support' && S.step === 'sent') S.step = 'choose';
  if (S.page !== 'register') {
    S.registerErrors = {};
    S.registerNotice = '';
  }
  if (S.page === 'admin') {
    S.adminNotice = '';
    if (S.adminAuthed !== false) void loadAdmin();
  }
  render();
  window.scrollTo({ top: 0 });
  if (jumpToEvents) {
    jumpToEvents = false;
    showEvents();
  }
}

/** Set by the header's "Events" link when it has to go to the home page first. */
let jumpToEvents = false;

/** Scroll to the other-events section and move focus there, for keyboard and screen-reader users. */
function showEvents(): void {
  const h = document.getElementById('events-h');
  if (!h) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  h.closest('section')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  h.focus({ preventScroll: true });
}

function setTheme(theme: Theme): void {
  S.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
}

function setCurrency(currency: Currency): void {
  if (S.currency === currency) return;
  S.currency = currency;
  S.amount = PRESETS[currency][1] ?? 0;
  S.supportError = '';
}

async function copy(button: HTMLElement): Promise<void> {
  const hint = button.querySelector<HTMLElement>('.copyhint') ?? button;
  const label = hint.textContent;
  try {
    await navigator.clipboard.writeText(button.dataset.copy ?? '');
    hint.textContent = 'Copied';
  } catch {
    hint.textContent = 'Select and copy';
  }
  setTimeout(() => (hint.textContent = label), 1600);
}

/* ---------- announcements ---------- */

/** Bumped when a list read starts, and when a save, publish or delete changes the list here. A
 *  read answers only if neither happened while it was on its way, so an older answer can never
 *  bring back a draft that was just deleted (or undo a save). */
let annReads = 0;
let annChanges = 0;

async function loadAnnouncements(): Promise<void> {
  S.ann.loadFailed = false;
  const read = ++annReads;
  const changesAtStart = annChanges;
  try {
    const res = await api.announcements();
    if (read !== annReads) return; // a newer read is on its way
    if (changesAtStart !== annChanges) return void loadAnnouncements(); // read again, fresh
    S.ann.list = res.announcements;
    S.ann.audience = res.audience;
    S.ann.counts = res.counts;
    S.ann.dailyLimit = res.dailyLimit;
    // Keep an address the organiser typed; otherwise suggest the organisers' inbox.
    if (!S.ann.testTo) S.ann.testTo = res.testTo;
  } catch (e) {
    if (read !== annReads) return;
    S.ann.error = errorMessage(e);
    S.ann.loadFailed = true;
    if (e instanceof ApiError && e.status === 401) S.adminAuthed = false;
  }
  if (S.page === 'admin' && S.tab === 'announcements') render();
}

const annFormEl = (): HTMLFormElement | null =>
  page.querySelector<HTMLFormElement>('form[data-form="announcement"]');

/** Copy what is typed in the announcement form into the state, so a re-render keeps it. */
function syncAnnForm(): void {
  const form = annFormEl();
  if (!form) return;
  const d = new FormData(form);
  const str = (k: string): string => String(d.get(k) ?? '').trim();
  S.ann.form = {
    title: str('title'),
    date: str('date'),
    endDate: str('endDate') || null,
    time: str('time') || null,
    theme: str('theme') || null,
    themeTba: d.get('themeTba') === 'on',
    venue: str('venue'),
    venueTba: d.get('venueTba') === 'on',
    summary: str('summary'),
    imageUrl: str('imageUrl') || null,
    linkUrl: str('linkUrl') || null,
    linkLabel: str('linkLabel') || null,
    subject: str('subject'),
    message: String(d.get('message') ?? ''),
  };
}

let previewTimer: ReturnType<typeof setTimeout> | undefined;
/** Redraw only the preview pane, so typing never loses its place. */
function refreshAnnPreview(): void {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const frame = document.getElementById('ann-frame');
    if (frame) frame.innerHTML = previewInner();
    fitMailFrames();
    const subj = document.getElementById('ann-subj');
    if (subj) subj.textContent = S.ann.form.subject || '…';
  }, 200);
}

/** Bumped whenever a different announcement (or the list) is opened, so a save that finishes
 *  afterwards updates the list but never switches the editor back to what it saved. */
let annEditor = 0;

/** Save the form as a draft (or the published event's site details). Returns its id, or null
 *  when it failed or the organiser has since moved to another announcement. */
async function saveAnnouncement(): Promise<number | null> {
  syncAnnForm();
  S.ann.error = '';
  S.ann.notice = '';
  const editor = annEditor;
  const editing = S.ann.editing;
  try {
    const { announcement } =
      typeof editing === 'number'
        ? await api.updateAnnouncement(editing, S.ann.form)
        : await api.createAnnouncement(S.ann.form);
    const list = S.ann.list ?? [];
    S.ann.list = [announcement, ...list.filter((x) => x.id !== announcement.id)];
    annChanges++;
    // The home page shows published events, so refresh it whichever editor is open now.
    if (announcement.status === 'published') void refreshUpcoming();
    if (editor !== annEditor) return null;
    S.ann.editing = announcement.id;
    return announcement.id;
  } catch (e) {
    if (editor === annEditor) S.ann.error = errorMessage(e);
    if (e instanceof ApiError && e.status === 401) S.adminAuthed = false;
    return null;
  }
}

/** Reload the other-events list the home page shows, after publishing or editing one. */
let upcomingRequest = 0;
async function refreshUpcoming(): Promise<void> {
  // Two publishes in a row start two refreshes; only the latest one's answer is kept.
  const request = ++upcomingRequest;
  try {
    const upcoming = (await api.publicInfo()).upcoming;
    if (request !== upcomingRequest) return;
    // null: the list could not be read just now, so keep the cards already shown.
    if (!upcoming) return;
    S.upcoming = upcoming;
    upcomingApplied++;
  } catch {
    return; // the next page load picks it up
  }
  // The organiser may already be back on the home page.
  if (S.page === 'home') render();
}

async function annAction(action: string, el: HTMLElement): Promise<void> {
  const a = S.ann;
  if (el.dataset.annEdit) {
    const x = a.list?.find((y) => y.id === Number(el.dataset.annEdit));
    if (!x) return;
    a.editing = x.id;
    a.form = { ...x };
    a.error = a.notice = '';
    // A dialog left open for another editor must never reappear over this one.
    a.confirming = false;
    annEditor++;
    freshForm = true;
    return render();
  }
  if (el.dataset.annView || el.dataset.annDevice) {
    syncAnnForm();
    if (el.dataset.annView) a.view = el.dataset.annView as 'email' | 'site';
    if (el.dataset.annDevice) a.device = el.dataset.annDevice as 'laptop' | 'phone';
    return render();
  }
  if (el.dataset.annPhoto !== undefined) {
    const input = document.getElementById('an-img') as HTMLInputElement | null;
    if (input) input.value = el.dataset.annPhoto;
    page
      .querySelectorAll<HTMLElement>('[data-ann-photo]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
    syncAnnForm();
    return refreshAnnPreview();
  }
  switch (action) {
    case 'ann-new':
      a.editing = 'new';
      a.form = blankAnnouncement();
      a.error = a.notice = '';
      a.confirming = false;
      annEditor++;
      freshForm = true;
      return render();
    case 'ann-back':
      annEditor++;
      a.confirming = false;
      a.editing = null;
      a.panel = 'list';
      a.importing = null;
      a.error = a.notice = '';
      render();
      return loadAnnouncements();
    case 'ann-retry':
      a.error = '';
      a.loadFailed = false; // show the spinner, not the error, while it tries again
      render();
      return loadAnnouncements();
    case 'ann-people':
      a.panel = 'people';
      a.people = null;
      a.peopleFailed = false;
      a.error = '';
      render();
      try {
        a.people = (await api.audience()).people;
      } catch (e) {
        a.error = errorMessage(e);
        a.peopleFailed = true;
      }
      return render();
    case 'ann-import':
      a.panel = 'import';
      a.importing = null;
      a.error = '';
      return render();
    case 'ann-test': {
      if (S.busy) return;
      syncAnnForm();
      a.testTo =
        (document.getElementById('an-test') as HTMLInputElement | null)?.value.trim() ?? '';
      S.busy = true;
      a.error = a.notice = '';
      render();
      // The answer belongs to the draft that asked; another opened meanwhile shows nothing of it.
      const editor = annEditor;
      const to = a.testTo;
      try {
        await api.testAnnouncement(a.form, to);
        if (editor === annEditor)
          a.notice = `Test sent to ${to}. Check that inbox, and its spam folder.`;
      } catch (e) {
        if (editor === annEditor) a.error = errorMessage(e);
      } finally {
        S.busy = false;
      }
      return render();
    }
    case 'ann-publish': {
      if (S.busy) return;
      S.busy = true;
      // Show the buttons as busy straight away (render keeps what is typed and where focus is).
      syncAnnForm();
      render();
      // Publishing sends what was saved, so the dialog only opens once the saved draft matches
      // the form. The fields stay editable while a save is on its way: if anything changed
      // meanwhile, save again (a few times at most) before asking.
      let id: number | null = null;
      let stable = false;
      for (let i = 0; i < 3 && !stable; i++) {
        syncAnnForm();
        const saving = JSON.stringify(a.form);
        id = await saveAnnouncement();
        if (id === null) break;
        syncAnnForm();
        stable = JSON.stringify(a.form) === saving;
      }
      S.busy = false;
      if (id !== null && stable) {
        a.confirming = true;
        a.send = { booked: true, imported: true };
      } else if (id !== null) {
        a.notice = 'Saved. Press Publish again once you have finished editing.';
      }
      render();
      // Into the dialog, so keyboard and screen-reader users start there.
      if (a.confirming) document.getElementById('ann-c-h')?.focus();
      return;
    }
    case 'ann-cancel':
      // Publishing can't be called back once it has started; the dialog closes when it is done.
      if (S.busy) return;
      a.confirming = false;
      render();
      document.getElementById('ann-publish-btn')?.focus();
      return;
    case 'ann-confirm': {
      if (S.busy || typeof a.editing !== 'number') return;
      // Keep the editor that asked: the list always gets the published entry, but the editor,
      // dialog and notices change only if that editor is still the one open.
      const editor = annEditor;
      S.busy = true;
      render();
      try {
        const scope =
          a.send.booked && a.send.imported ? 'all' : a.send.booked ? 'booked' : 'imported';
        const { announcement } = await api.publishAnnouncement(a.editing, scope);
        a.list = (a.list ?? []).map((x) => (x.id === announcement.id ? announcement : x));
        annChanges++;
        void refreshUpcoming();
        S.busy = false;
        if (editor !== annEditor) {
          a.confirming = false;
          return render();
        }
        a.confirming = false;
        a.editing = null;
        a.notice = `Published. Emailing ${announcement.recipients} people.`;
        freshForm = true;
        render();
        const row = page.querySelector('.ann-row');
        if (row) burst(row, { count: 48, spread: 240 });
        return;
      } catch (e) {
        if (editor === annEditor) {
          a.error = errorMessage(e);
          a.confirming = false;
        }
      }
      S.busy = false;
      render();
      // The dialog closed: back to the button that opened it, as Cancel does.
      if (editor === annEditor) document.getElementById('ann-publish-btn')?.focus();
      return;
    }
    case 'ann-delete': {
      // Keep the id and editor that asked: the organiser may open another draft meanwhile.
      const id = a.editing;
      if (typeof id !== 'number' || S.busy || !window.confirm('Delete this draft?')) return;
      const editor = annEditor;
      S.busy = true;
      render();
      try {
        await api.deleteAnnouncement(id);
        a.list = (a.list ?? []).filter((x) => x.id !== id);
        annChanges++;
        if (editor === annEditor) a.editing = null;
      } catch (e) {
        if (editor === annEditor) a.error = errorMessage(e);
      } finally {
        S.busy = false;
      }
      return render();
    }
  }
}

async function setContribution(id: number, status: string): Promise<void> {
  if (S.busy) return;
  S.busy = true;
  try {
    await api.setContributionStatus(id, status as 'pending' | 'confirmed' | 'rejected');
    await loadAdmin();
  } catch (e) {
    S.adminError = errorMessage(e);
    if (e instanceof ApiError && e.status === 401) S.adminAuthed = false;
  } finally {
    S.busy = false;
    render();
  }
}

window.addEventListener('hashchange', applyRoute);

document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  // A click to register for another BTN event: a burst first, then the link opens in a new tab
  // (opening it straight away would hide the burst behind the new tab).
  const register = target.closest<HTMLAnchorElement>('.up-card a.btn');
  // A plain left click only: Ctrl/Cmd/Shift/Alt-clicks and other buttons open the way the browser
  // and the visitor chose.
  const plain =
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
  if (register && plain && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    e.preventDefault();
    burst(register, { count: 36, spread: 170 });
    setTimeout(() => {
      // ("noopener" would make window.open return null, so cut the link to this page instead.)
      const tab = window.open(register.href, '_blank');
      if (tab) tab.opener = null;
      else location.href = register.href;
    }, 450);
    return;
  }
  if (await handleShareClick(target)) return;
  const el = target.closest<HTMLElement>(
    '[data-route],[data-amount],[data-tab],[data-action],[data-copy],[data-contrib],[data-currency],[data-ann-edit],[data-ann-view],[data-ann-device],[data-ann-photo]',
  );
  if (!el) return;
  const d = el.dataset;
  if (
    d.annEdit ||
    d.annView ||
    d.annDevice ||
    d.annPhoto !== undefined ||
    d.action?.startsWith('ann-')
  )
    return annAction(d.action ?? '', el);
  if (d.route) return go(d.route as Route);
  if (d.copy !== undefined) return copy(el);
  if (d.contrib) return setContribution(Number(d.contrib), d.status ?? '');
  if (d.currency) {
    // Keep the typed name and email; the amount resets to that currency's default.
    const form = el.closest('form');
    if (form) {
      S.giverName = String(new FormData(form).get('name') ?? '');
      S.email = String(new FormData(form).get('email') ?? '');
    }
    setCurrency(d.currency as Currency);
    render();
    const amt = document.getElementById('amt') as HTMLInputElement | null;
    if (amt) amt.value = String(S.amount);
    return;
  }
  if (d.tab) {
    S.tab = d.tab as AdminTab;
    S.adminNotice = '';
    S.adminError = '';
    if (S.tab === 'announcements') {
      annEditor++;
      S.ann.editing = null;
      S.ann.confirming = false;
      S.ann.panel = 'list';
      S.ann.importing = null;
      void loadAnnouncements();
    }
    return render();
  }
  if (d.amount) {
    S.amount = Number(d.amount);
    const input = document.getElementById('amt') as HTMLInputElement | null;
    if (input) input.value = String(S.amount);
    document
      .querySelectorAll<HTMLElement>('[data-amount]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(Number(b.dataset.amount) === S.amount)),
      );
    return;
  }
  switch (d.action) {
    case 'menu':
      S.menu = !S.menu;
      return render();
    case 'events':
      if (S.page !== 'home') {
        jumpToEvents = true;
        return go('home');
      }
      S.menu = false;
      render();
      return showEvents();
    case 'theme':
      setTheme(S.theme === 'dark' ? 'light' : 'dark');
      return render();
    case 'retry':
      return loadPublic();
    case 'reset':
      S.step = 'choose';
      S.supportError = '';
      return render();
    case 'sent': {
      if (S.busy) return;
      S.busy = true;
      S.supportError = '';
      render();
      try {
        await api.markSent(S.reference);
        S.step = 'sent';
      } catch (err) {
        S.supportError = errorMessage(err);
      }
      S.busy = false;
      return render();
    }
    case 'logout':
      try {
        await api.logout();
      } catch (err) {
        S.adminError = `Sign out did not complete: ${errorMessage(err)}`;
        return render();
      }
      adminGeneration++;
      S.admin = null;
      S.adminAuthed = false;
      S.adminError = '';
      return render();
    case 'admin-reload':
      return loadAdmin();
    case 'cancel-seat':
      return cancelSeat();
    case 'unsub-confirm':
      return preferences('unsubscribe');
    case 'unsub-undo':
      return preferences('resubscribe');
  }
});

async function submitRegister(data: FormData): Promise<void> {
  const result = validateRegistration(data);
  if (!result.ok) {
    S.registerErrors = result.errors;
    S.registerNotice = '';
    render();
    const first = page.querySelector<HTMLElement>('[aria-invalid="true"]');
    (first ?? page.querySelector<HTMLElement>('.err'))?.focus();
    return;
  }
  S.busy = true;
  S.registerErrors = {};
  S.registerNotice = '';
  render();
  try {
    const res = await api.reserve(Object.fromEntries(data) as Record<string, string>);
    seatCount.applyLatest(() => (S.reserved = res.reserved));
    if (S.event) S.event.capacity = res.capacity;
    if (res.status === 'created') {
      // The home-page entry has been used; it must not refill the form later.
      S.draft = null;
      S.attendee = res.reservation;
      S.attendeeEmailed = res.emailQueued;
      S.busy = false;
      go('confirmed');
      // Celebrate as the seat number drops onto the pass.
      setTimeout(() => {
        const seat = document.querySelector('.pass .seatno') ?? document.querySelector('.pass');
        if (seat) burst(seat, { count: 64, spread: 300, on: 'cloth' });
      }, 650);
      return;
    }
    S.registerNotice =
      res.status === 'full'
        ? 'Sorry, the last seat was just taken.'
        : `This email already has a seat for this gathering. ${res.emailQueued ? "We've sent the confirmation again." : 'Check your inbox, and your spam folder, for the confirmation email.'}`;
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fields).length) S.registerErrors = e.fields;
    else S.registerNotice = errorMessage(e);
  }
  S.busy = false;
  render();
}

async function submitSupport(data: FormData): Promise<void> {
  // Keep what the visitor typed so an error does not wipe the form.
  const typed = Number(data.get('amount'));
  if (Number.isFinite(typed) && typed > 0) S.amount = typed;
  S.giverName = String(data.get('name') ?? '').trim();
  S.email = String(data.get('email') ?? '').trim();
  const result = validateContribution(data);
  if (!result.ok) {
    S.supportError = result.errors;
    return render();
  }
  S.busy = true;
  S.supportError = '';
  render();
  try {
    const res = await api.startContribution(Object.fromEntries(data) as Record<string, string>);
    S.reference = res.reference;
    S.currency = res.currency;
    S.amount = res.amount;
    S.bank = res.bank;
    S.step = 'details';
  } catch (e) {
    S.supportError = errorMessage(e);
  }
  S.busy = false;
  render();
}

async function submitEvent(data: FormData): Promise<void> {
  S.busy = true;
  S.adminError = '';
  S.adminNotice = '';
  render();
  try {
    const { event } = await api.saveEvent({
      title: String(data.get('title') ?? ''),
      date: String(data.get('date') ?? ''),
      time: String(data.get('time') ?? ''),
      venue: String(data.get('venue') ?? ''),
      capacity: Number(data.get('capacity')),
    });
    eventVersion++;
    S.event = event;
    if (S.admin) S.admin.event = event;
    S.adminNotice = 'Saved.';
  } catch (e) {
    S.adminError = errorMessage(e);
    if (e instanceof ApiError && e.status === 401) S.adminAuthed = false;
  }
  S.busy = false;
  render();
}

async function submitLogin(data: FormData): Promise<void> {
  S.busy = true;
  S.adminError = '';
  render();
  try {
    await api.login(String(data.get('password') ?? ''));
    S.adminAuthed = true;
    S.admin = null;
    S.busy = false;
    render();
    await loadAdmin();
    return;
  } catch (e) {
    S.adminError = errorMessage(e);
  }
  S.busy = false;
  render();
  page.querySelector<HTMLInputElement>('#ap')?.focus();
}

/* An open dialog keeps keyboard focus inside it: Tab cycles through its controls and Escape
   closes it. */
document.addEventListener('keydown', (e) => {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  if (!dialog) return;
  if (e.key === 'Escape') {
    if (S.busy) return;
    e.preventDefault();
    dialog.querySelector<HTMLElement>('[data-dialog-close]')?.click();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [
    ...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
    ),
  ];
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  // Focus may be on a control, on the heading (where the dialog opens), or outside the dialog.
  const at = items.indexOf(document.activeElement as HTMLElement);
  const inside = dialog.contains(document.activeElement);
  if (e.shiftKey && (at <= 0 || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (at === items.length - 1 || !inside)) {
    e.preventDefault();
    first.focus();
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  if (S.busy) return;
  const data = new FormData(form);
  if (kind === 'quick') {
    // First step from the home page: carry what was typed to the Reserve form.
    S.draft = {
      name: String(data.get('fullName') ?? '').trim(),
      email: String(data.get('email') ?? '').trim(),
    };
    go('register');
    // The name and email are filled in; the next field to complete is WhatsApp.
    setTimeout(() => document.getElementById('p')?.focus(), 60);
    return;
  }
  if (kind === 'import') {
    void submitImport(data);
    return;
  }
  if (kind === 'announcement') {
    // One save at a time: a second one (Save draft or Enter while Publish is saving) would create
    // a second draft, and whichever finished first would clear the busy flag of the other.
    if (S.busy) return;
    void (async () => {
      S.busy = true;
      render();
      const id = await saveAnnouncement();
      S.busy = false;
      if (id !== null) S.ann.notice = 'Saved.';
      render();
    })();
    return;
  }
  if (kind === 'register') void submitRegister(data);
  else if (kind === 'support') void submitSupport(data);
  else if (kind === 'event') void submitEvent(data);
  else if (kind === 'login') void submitLogin(data);
});

try {
  if (localStorage.getItem(THEME_KEY) === 'dark') S.theme = 'dark';
} catch {
  /* storage blocked */
}
// Choosing an import file, or ticking who an announcement goes to.
document.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.matches('[data-ann-file]')) void readImportFile(t);
  else if (t.matches('[data-ann-send]')) {
    S.ann.send[t.dataset.annSend as 'booked' | 'imported'] = t.checked;
    render();
  }
});

// Typing in the announcement form redraws its preview only.
document.addEventListener('input', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('form[data-form="announcement"]')) {
    syncAnnForm();
    // A "to be announced" box changes the form itself (label, disabled field): redraw it all.
    if (t.matches('[data-ann-tba]')) render();
    else refreshAnnPreview();
  }
});

initShareKeys();
applyRoute();
void loadPublic();
