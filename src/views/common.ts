import { IMG } from '../images';
import { pattern } from '../lib/cloth';
import { capacity, ready, reserved, seatsLeft, S, type Route } from '../state';

export const btn = (label: string, route: Route, kind = ''): string =>
  `<button type="button" class="btn ${kind}" data-route="${route}">${label}</button>`;

/** Line icons, one stroke weight. */
const svg = (d: string): string =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const ICON = {
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  cal: svg(
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  ),
  grid: svg(
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  ),
  users: svg(
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.6 5.4"/>',
  ),
  gift: svg(
    '<rect x="3.5" y="8" width="17" height="12.5" rx="2"/><path d="M12 8v12.5M3.5 12.5h17M12 8C10.5 4 6.5 4 7 6.5S12 8 12 8zm0 0c1.5-4 5.5-4 5-1.5S12 8 12 8z"/>',
  ),
  back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  megaphone: svg(
    '<path d="M3.5 10.5v3a1 1 0 0 0 1 1H7l5.5 4.5v-14L7 9.5H4.5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  ),
  out: svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'),
};

/** Shown when the gathering details could not be loaded. */
export const loadBanner = (): string =>
  S.load === 'error'
    ? `<div class="demo" role="alert">We couldn’t load the latest gathering details. <button class="link" data-action="retry" type="button">Try again</button></div>`
    : '';

/** Text that depends on loaded data: a placeholder until it arrives. */
export const when = (text: () => string, placeholder = '…'): string =>
  ready() ? text() : placeholder;

/** One light per seat; lit lights are reserved seats. They switch on in seat order, once. */
export function seatWall(): string {
  if (!ready())
    return `<div class="wall" role="img" aria-label="Loading seats">${'<span class="n"></span>'.repeat(120)}</div>`;
  const n = reserved();
  const mine = S.attendee?.seat;
  const lights = Array.from({ length: capacity() }, (_, i) => {
    const lit = i < n;
    const isMine = lit && mine !== undefined && i === Math.min(mine, n) - 1;
    return `<span class="n${lit ? ' lit' : ''}${isMine ? ' mine' : ''}"${lit ? ` style="--i:${i}"` : ''}></span>`;
  }).join('');
  return `<div class="wall" role="img" aria-label="${n} of ${capacity()} seats reserved, ${seatsLeft()} left">${lights}</div>`;
}

const logo = (): string => `<img class="logo" src="${IMG.logo}" alt="Believers Tech Network">`;

/** The top bar. It sits on the cloth of the section that follows it. */
export function nav(): string {
  const cur = (p: Route): string => (S.page === p ? 'aria-current="page"' : '');
  return `${loadBanner()}<header class="nav">
  <button class="brand" data-route="home" type="button" aria-label="Just Pray, home">${logo()}<span class="sep"></span><span class="wm">Just Pray</span></button>
  <nav class="nav-links" aria-label="Main"><button data-route="home" ${cur('home')} type="button">About</button><button data-route="register" ${cur('register')} type="button">Next gathering</button><button data-route="support" ${cur('support')} type="button">Support</button></nav>
  <button class="btn gold small" data-route="register" type="button">Reserve a seat</button>
  <button class="menu-btn" data-action="menu" type="button" aria-expanded="${S.menu}" aria-controls="mnav">${S.menu ? 'Close' : 'Menu'}</button>
  <nav id="mnav" class="mobile-nav ${S.menu ? 'open' : ''}" aria-label="Mobile"><button data-route="home" type="button">About</button><button data-route="register" type="button">Reserve a seat</button><button data-route="support" type="button">Support</button><button data-action="share" type="button">Share</button></nav></header>`;
}

export const footer = (): string =>
  `<footer class="footer cloth">${pattern(28, 2, 9, 0.1)}${logo()}<b>Just Pray</b><nav aria-label="Footer"><button data-route="register" type="button">Reserve</button><button data-route="support" type="button">Support</button><button data-action="share" type="button">Share</button><button class="theme" data-action="theme" type="button" aria-pressed="${S.theme === 'dark'}">${S.theme === 'dark' ? 'Light mode' : 'Dark mode'}</button></nav></footer>`;
