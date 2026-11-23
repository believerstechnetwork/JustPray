import './styles.css';
import { DEMO_MODE } from './config';
import { validateContribution, validateRegistration } from './lib/validation';
import { handleShareClick, initShareKeys } from './share';
import { ROUTES, S, store, type AdminTab, type Route } from './state';
import { admin } from './views/admin';
import { confirmed } from './views/confirmed';
import { home } from './views/home';
import { register } from './views/register';
import { payment, support } from './views/support';

const views: Record<Route, () => string> = { home, register, confirmed, support, payment, admin };
const TITLES: Record<Route, string> = {
  home: 'Just Pray: a free monthly prayer gathering for people in tech',
  register: 'Reserve a seat · Just Pray',
  confirmed: 'Seat reserved · Just Pray',
  support: 'Support the gathering · Just Pray',
  payment: 'Thank you · Just Pray',
  admin: 'Organiser · Just Pray',
};

const page = document.getElementById('page') as HTMLElement;

const routeFromHash = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'home';
};

function render(): void {
  document.documentElement.dataset.mode = S.theme;
  document.title = TITLES[S.page];
  page.innerHTML = views[S.page]();
  const main = page.querySelector('main') ?? page.querySelector('section:not(.admin)');
  main?.setAttribute('id', 'main');
}

/** Navigate: sets the hash, which triggers a render via hashchange. */
function go(route: Route): void {
  if (routeFromHash() === route && S.page === route) {
    render();
  } else {
    location.hash = `/${route}`;
  }
}

function applyRoute(): void {
  const route = routeFromHash();
  // The confirmation page only makes sense after a reservation.
  S.page = route === 'confirmed' && !S.attendee ? 'register' : route;
  S.menu = false;
  S.supportError = '';
  if (S.page === 'support') S.step = 'choose';
  if (S.page !== 'register') {
    S.registerErrors = {};
    S.registerNotice = '';
  }
  // The "confirmed payment" screen is a design example, demo only.
  if (S.page === 'payment' && !DEMO_MODE) S.page = 'support';
  render();
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', applyRoute);

document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  if (await handleShareClick(target)) return;
  const el = target.closest<HTMLElement>('[data-route],[data-amount],[data-tab],[data-action]');
  if (!el) return;
  const d = el.dataset;
  if (d.route) return go(d.route as Route);
  if (d.tab) {
    S.tab = d.tab as AdminTab;
    S.eventSaved = false;
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
      S.theme = S.theme === 'dark' ? 'light' : 'dark';
      return render();
    case 'reset':
      S.step = 'choose';
      return render();
    case 'verify':
      S.step = 'checking';
      render();
      setTimeout(() => {
        if (S.step === 'checking') {
          S.step = 'pending';
          render();
        }
      }, 1100);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  const kind = form.dataset.form;
  if (!kind) return;
  e.preventDefault();
  const data = new FormData(form);

  if (kind === 'register') {
    const result = validateRegistration(data);
    if (!result.ok) {
      S.registerErrors = result.errors;
      S.registerNotice = '';
      render();
      const first = page.querySelector<HTMLElement>('[aria-invalid="true"]');
      (first ?? page.querySelector<HTMLElement>('.err'))?.focus();
      return;
    }
    const res = store.reserve({ ...result.value });
    if (!res.ok) {
      S.registerErrors = {};
      S.registerNotice = 'Sorry, the last seat was just taken.';
      return render();
    }
    S.attendee = res.reservation;
    S.registerErrors = {};
    S.registerNotice = '';
    go('confirmed');
  } else if (kind === 'support') {
    // Keep what the visitor typed so a validation error does not wipe the form.
    const typed = Number(data.get('amount'));
    if (Number.isFinite(typed) && typed > 0) S.amount = typed;
    S.email = String(data.get('email') ?? '').trim();
    const result = validateContribution(data);
    if (!result.ok) {
      S.supportError = result.errors;
      return render();
    }
    S.amount = result.value.amount;
    S.email = result.value.email;
    S.supportError = '';
    S.step = 'details';
    render();
  } else if (kind === 'event') {
    const title = String(data.get('title') ?? '').trim();
    const date = String(data.get('date') ?? '');
    const time = String(data.get('time') ?? '').trim();
    const venue = String(data.get('venue') ?? '').trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !venue) return;
    S.event = { title, date, time, venue };
    store.saveEvent(S.event);
    S.eventSaved = true;
    render();
  }
});

initShareKeys();
applyRoute();
