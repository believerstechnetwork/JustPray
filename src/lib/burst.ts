/* A short burst of ivory and blue bubbles: the site's "light" scattering out from a moment worth
   celebrating (a seat reserved, an event published, a click to register). It plays once, lasts
   about a second and a half, ignores the pointer, and is skipped for anyone who prefers reduced
   motion. Only transform and opacity animate, so it stays smooth on phones. */

/** Colours per background: on the indigo cloth, ivory, white and sky blue; on light pages, indigo,
 *  BTN blue and a warm sand that shows on white. */
const PALETTES = {
  cloth: ['#EFE4CF', '#FFFFFF', '#A9C8FF', '#F8F1E3', '#7AB9F5'],
  light: ['#0E2766', '#0A6FC2', '#C9AE7E', '#16378C', '#7AB9F5'],
};

export interface BurstOptions {
  /** Number of bubbles. */
  count?: number;
  /** How far they travel, in pixels. */
  spread?: number;
  /** The background it plays over. */
  on?: keyof typeof PALETTES;
}

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Burst from the centre of an element, or from a point on the screen. */
export function burst(from: Element | { x: number; y: number }, options: BurstOptions = {}): void {
  if (reducedMotion() || typeof document === 'undefined') return;
  const { count = 40, spread = 200, on = 'light' } = options;
  const colours = PALETTES[on];
  let x: number;
  let y: number;
  if (from instanceof Element) {
    const r = from.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  } else ({ x, y } = from);

  const layer = document.createElement('div');
  layer.className = 'burst';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  let longest = 0;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('i');
    const size = 7 + Math.random() * 13;
    const ring = Math.random() < 0.3;
    const colour = colours[i % colours.length] ?? '#EFE4CF';
    dot.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;${ring ? `border:2.5px solid ${colour}` : `background:${colour};box-shadow:0 0 ${size}px ${colour}66`}`;
    layer.appendChild(dot);

    // Mostly upward and outward, then a little drift down, like bubbles that lose their lift.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
    const dist = spread * (0.45 + Math.random() * 0.75);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const duration = 1100 + Math.random() * 700;
    const delay = Math.random() * 120;
    longest = Math.max(longest, duration + delay);
    dot.animate(
      [
        { transform: 'translate(0, 0) scale(0.3)', opacity: 0 },
        {
          transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1)`,
          opacity: 1,
          offset: 0.22,
        },
        // Stay bright for most of the flight, then fade as they drift down.
        {
          transform: `translate(${dx * 0.92}px, ${dy * 0.92 + 14}px) scale(0.9)`,
          opacity: 1,
          offset: 0.7,
        },
        { transform: `translate(${dx}px, ${dy + 46}px) scale(0.6)`, opacity: 0 },
      ],
      { duration, delay, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'both' },
    );
  }
  setTimeout(() => layer.remove(), longest + 100);
}
