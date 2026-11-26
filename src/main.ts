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
};
const TITLES: Record<Route, string> = {
  home: 'Just Pray: a free monthly prayer gathering for people in tech',
  register: 'Reserve a seat · Just Pray',
  confirmed: 'Seat reserved · Just Pray',
  support: 'Support the gathering · Just Pray',
  admin: 'Organiser · Just Pray',
  cancel: 'Cancel your seat · Just Pray',
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
  page.querySelectorAll<Field>('input[id], textarea[id]').forEach((el) => {
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

async function loadPublic(): Promise<void> {
  S.load = 'loading';
  const ticket = seatCount.ticket();
  const eventAtStart = eventVersion;
  let switchedToUsd = false;
  try {
    const info = await api.publicInfo();
    if (eventAtStart === eventVersion) S.event = info.event;
    seatCount.applyRead(ticket, () => (S.reserved = info.reserved));
    S.banks = info.banks;
    S.upcoming = info.upcoming ?? [];
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

async function loadAnnouncements(): Promise<void> {
  try {
    const res = await api.announcements();
    S.ann.list = res.announcements;
    S.ann.audience = res.audience;
  } catch (e) {
    S.ann.error = errorMessage(e);
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

/** Save the form as a draft (or the published event's site details). Returns its id. */
async function saveAnnouncement(): Promise<number | null> {
  syncAnnForm();
  S.ann.error = '';
  S.ann.notice = '';
  try {
    const { announcement } =
      typeof S.ann.editing === 'number'
        ? await api.updateAnnouncement(S.ann.editing, S.ann.form)
        : await api.createAnnouncement(S.ann.form);
    S.ann.editing = announcement.id;
    const list = S.ann.list ?? [];
    S.ann.list = [announcement, ...list.filter((x) => x.id !== announcement.id)];
    return announcement.id;
  } catch (e) {
    S.ann.error = errorMessage(e);
    if (e instanceof ApiError && e.status === 401) S.adminAuthed = false;
    return null;
  }
}

async function annAction(action: string, el: HTMLElement): Promise<void> {
  const a = S.ann;
  if (el.dataset.annEdit) {
    const x = a.list?.find((y) => y.id === Number(el.dataset.annEdit));
    if (!x) return;
    a.editing = x.id;
    a.form = { ...x };
    a.error = a.notice = '';
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
      freshForm = true;
      return render();
    case 'ann-back':
      a.editing = null;
      a.error = a.notice = '';
      render();
      return loadAnnouncements();
    case 'ann-publish': {
      if (S.busy) return;
      S.busy = true;
      const id = await saveAnnouncement();
      S.busy = false;
      if (id !== null) a.confirming = true;
      return render();
    }
    case 'ann-cancel':
      a.confirming = false;
      return render();
    case 'ann-confirm': {
      if (S.busy || typeof a.editing !== 'number') return;
      S.busy = true;
      render();
      try {
        const { announcement } = await api.publishAnnouncement(a.editing);
        a.list = (a.list ?? []).map((x) => (x.id === announcement.id ? announcement : x));
        a.confirming = false;
        a.editing = null;
        a.notice = `Published. Emailing ${announcement.recipients} people.`;
        freshForm = true;
        S.busy = false;
        render();
        const row = page.querySelector('.ann-row');
        if (row) burst(row, { count: 48, spread: 240 });
        return;
      } catch (e) {
        a.error = errorMessage(e);
        a.confirming = false;
      }
      S.busy = false;
      return render();
    }
    case 'ann-delete': {
      if (typeof a.editing !== 'number' || !window.confirm('Delete this draft?')) return;
      try {
        await api.deleteAnnouncement(a.editing);
        a.list = (a.list ?? []).filter((x) => x.id !== a.editing);
        a.editing = null;
      } catch (e) {
        a.error = errorMessage(e);
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
  if (register && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
      S.ann.editing = null;
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
  if (kind === 'announcement') {
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
