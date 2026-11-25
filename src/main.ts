import './styles.css';
import { api, ApiError } from './api';
import { latestGuard } from './lib/latest';
import { validateContribution, validateRegistration } from './lib/validation';
import { handleShareClick, initShareKeys } from './share';
import type { Currency } from './data/types';
import { PRESETS, ROUTES, S, type AdminTab, type Route, type Theme } from './state';
import { admin } from './views/admin';
import { confirmed } from './views/confirmed';
import { home } from './views/home';
import { register } from './views/register';
import { support } from './views/support';

const views: Record<Route, () => string> = { home, register, confirmed, support, admin };
const TITLES: Record<Route, string> = {
  home: 'Just Pray: a free monthly prayer gathering for people in tech',
  register: 'Reserve a seat · Just Pray',
  confirmed: 'Seat reserved · Just Pray',
  support: 'Support the gathering · Just Pray',
  admin: 'Organiser · Just Pray',
};
const THEME_KEY = 'jp:theme';

const page = document.getElementById('page') as HTMLElement;
let renderedPage: Route | null = null;
/** The seat count arrives from page loads and from bookings; an older answer must not replace a newer one. */
const seatCount = latestGuard();

const routeFromHash = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
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

function render(): void {
  const snap = renderedPage === S.page ? snapshot() : null;
  document.documentElement.dataset.mode = S.theme;
  document.title = TITLES[S.page];
  page.innerHTML = views[S.page]();
  const main = page.querySelector('main') ?? page.querySelector('section:not(.admin)');
  main?.setAttribute('id', 'main');
  if (snap) restore(snap);
  renderedPage = S.page;
}

/** Navigate: sets the hash, which triggers a render via hashchange. */
function go(route: Route): void {
  if (routeFromHash() === route && S.page === route) render();
  else location.hash = `/${route}`;
}

async function loadPublic(): Promise<void> {
  S.load = 'loading';
  const ticket = seatCount.ticket();
  try {
    const info = await api.publicInfo();
    S.event = info.event;
    seatCount.applyRead(ticket, () => (S.reserved = info.reserved));
    S.banks = info.banks;
    // Offer dollars by default only when there is no naira account.
    if (!S.banks.NGN && S.banks.USD) setCurrency('USD');
    S.load = 'ready';
  } catch {
    S.load = 'error';
  }
  render();
}

async function loadAdmin(): Promise<void> {
  S.adminError = '';
  const ticket = seatCount.ticket();
  try {
    S.admin = await api.adminData();
    S.adminAuthed = true;
    if (S.admin.event) S.event = S.admin.event;
    const reservedNow = S.admin.reserved;
    seatCount.applyRead(ticket, () => (S.reserved = reservedNow));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) S.adminAuthed = false;
    else S.adminError = errorMessage(e);
  }
  if (S.page === 'admin') render();
}

function applyRoute(): void {
  const route = routeFromHash();
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
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(button.dataset.copy ?? '');
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Select and copy';
  }
  setTimeout(() => (button.textContent = label), 1600);
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
  if (await handleShareClick(target)) return;
  const el = target.closest<HTMLElement>(
    '[data-route],[data-amount],[data-tab],[data-action],[data-copy],[data-contrib],[data-currency]',
  );
  if (!el) return;
  const d = el.dataset;
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
      S.admin = null;
      S.adminAuthed = false;
      S.adminError = '';
      return render();
    case 'admin-reload':
      return loadAdmin();
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
      S.attendee = res.reservation;
      S.attendeeEmailed = res.emailQueued;
      S.busy = false;
      return go('confirmed');
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
initShareKeys();
applyRoute();
void loadPublic();
