import { IMG, type ImageKey } from '../images';
import { capacity, ready, reserved, seatsLeft, S, type Route } from '../state';

export const btn = (label: string, route: Route, kind = ''): string =>
  `<button type="button" class="btn ${kind}" data-route="${route}">${label}</button>`;

/** Shown when the gathering details could not be loaded. */
export const loadBanner = (): string =>
  S.load === 'error'
    ? `<div class="demo" role="alert">We couldn't load the latest gathering details. <button class="link" data-action="retry" type="button">Try again</button></div>`
    : '';

/** Text that depends on loaded data: a placeholder until it arrives. */
export const when = (text: () => string, placeholder = '…'): string =>
  ready() ? text() : placeholder;

const mix = (p: number): string => `color-mix(in srgb,var(--deep) ${p}%,transparent)`;
export const ovSide = `linear-gradient(90deg,${mix(94)} 0%,${mix(72)} 40%,${mix(10)} 80%),linear-gradient(0deg,var(--deep) 0%,transparent 26%)`;
export const ovHeadSide = `linear-gradient(90deg,${mix(92)} 0%,${mix(68)} 55%,${mix(34)} 100%)`;
export const ovFlat = (a = 80): string =>
  `linear-gradient(180deg,${mix(a)},${mix(Math.min(a + 12, 96))})`;

/** Inline style that sets a background photo for `.photo-bg` sections. */
export const photoBg = (key: ImageKey, pos: string, overlay: string): string =>
  `style="--img:url('${IMG[key]}');--pos:${pos};--ov:${overlay}"`;

/** One light per seat; lit lights are reserved seats. */
export function seatWall(): string {
  if (!ready())
    return `<div class="wall" role="img" aria-label="Loading seats">${'<span class="n"></span>'.repeat(120)}</div>`;
  const n = reserved();
  const mine = S.attendee?.seat;
  const lights = Array.from({ length: capacity() }, (_, i) => {
    const lit = i < n;
    const isMine = lit && mine !== undefined && i === Math.min(mine, n) - 1;
    const delay = lit && !isMine ? ` style="--d:${((i * 37) % 23) / 10}s"` : '';
    return `<span class="n${lit ? ' lit' : ''}${isMine ? ' mine' : ''}"${delay}></span>`;
  }).join('');
  return `<div class="wall" role="img" aria-label="${n} of ${capacity()} seats reserved, ${seatsLeft()} left">${lights}</div>`;
}

export function nav(): string {
  const cur = (p: Route): string => (S.page === p ? 'aria-current="page"' : '');
  return `${loadBanner()}<header class="nav">
  <button class="brand" data-route="home" type="button" aria-label="Just Pray, home"><span class="wm">Just Pray</span><span class="sep"></span><img class="btn-logo" src="${IMG.logo}" alt="Believers Tech Network"></button>
  <nav class="nav-links" aria-label="Main"><button data-route="home" ${cur('home')} type="button">About</button><button data-route="register" ${cur('register')} type="button">Next gathering</button><button data-route="support" ${cur('support')} type="button">Support</button></nav>
  <button class="btn small ghost-w" data-action="share" type="button">Share</button>
  <button class="btn small" data-route="register" type="button">Reserve a seat</button>
  <button class="menu-btn" data-action="menu" type="button" aria-expanded="${S.menu}" aria-controls="mnav">${S.menu ? 'Close' : 'Menu'}</button></header>
  <nav id="mnav" class="mobile-nav ${S.menu ? 'open' : ''}" aria-label="Mobile"><button data-route="home" type="button">About</button><button data-route="register" type="button">Reserve a seat</button><button data-route="support" type="button">Support</button><button data-action="share" type="button">Share</button></nav>`;
}

export const footer = (): string =>
  `<footer class="footer"><div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap"><b>Just Pray</b><img class="btn-logo" style="height:34px" src="${IMG.logo}" alt="Believers Tech Network"></div><div><button data-route="register" type="button">Reserve</button><button data-route="support" type="button">Support</button><button class="theme" data-action="theme" type="button" aria-pressed="${S.theme === 'dark'}">${S.theme === 'dark' ? 'Light mode' : 'Dark mode'}</button></div></footer>`;
