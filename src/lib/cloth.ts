/**
 * Adire cloth: squares of hand-drawn motifs (rings, dot grids, the BTN logo's strands, combs,
 * arcs, a leaf), joined by dotted seams, drawn white on indigo. Pure SVG strings, cached, so a
 * re-render costs nothing. Decorative only: every cloth is aria-hidden.
 */

type Motif = (s: number) => string;

const stroke = (w: number): string =>
  `fill="none" stroke="currentColor" stroke-width="${w.toFixed(2)}"`;

const MOTIFS: Record<string, Motif> = {
  rings: (s) => {
    const c = s / 2;
    return (
      [0.38, 0.26, 0.14]
        .map((r) => `<circle cx="${c}" cy="${c}" r="${s * r}" ${stroke(s * 0.045)}/>`)
        .join('') + `<circle cx="${c}" cy="${c}" r="${s * 0.05}" fill="currentColor"/>`
    );
  },
  dots: (s) => {
    let o = '';
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        o += `<circle cx="${s * (0.2 + i * 0.2)}" cy="${s * (0.2 + j * 0.2)}" r="${s * 0.05}" fill="currentColor"/>`;
    return o;
  },
  strands: (s) => {
    let o = '';
    for (let i = 0; i < 5; i++) {
      const x = s * (0.18 + i * 0.16);
      const top = s * (0.16 + (i % 2) * 0.12);
      o += `<path d="M${x} ${s * 0.86}V${top}" ${stroke(s * 0.04)} stroke-linecap="round"/><circle cx="${x}" cy="${top}" r="${s * 0.06}" fill="currentColor"/>`;
    }
    return o;
  },
  comb: (s) => {
    let o = `<path d="M${s * 0.12} ${s * 0.3}H${s * 0.88}M${s * 0.12} ${s * 0.7}H${s * 0.88}" ${stroke(s * 0.045)}/>`;
    for (let i = 0; i < 7; i++) {
      const x = s * (0.15 + i * 0.117);
      o += `<path d="M${x} ${s * 0.3}V${s * 0.48}M${x} ${s * 0.7}V${s * 0.52}" ${stroke(s * 0.035)}/>`;
    }
    return o;
  },
  arcs: (s) =>
    [0.22, 0.38, 0.54]
      .map(
        (r) =>
          `<path d="M${s * 0.1} ${s * 0.9 - s * r}A${s * r} ${s * r} 0 0 1 ${s * 0.1 + s * r} ${s * 0.9}" ${stroke(s * 0.045)}/>`,
      )
      .join('') +
    [0.22, 0.38]
      .map(
        (r) =>
          `<path d="M${s * 0.9} ${s * 0.1 + s * r}A${s * r} ${s * r} 0 0 1 ${s * 0.9 - s * r} ${s * 0.1}" ${stroke(s * 0.045)}/>`,
      )
      .join(''),
  leaf: (s) =>
    `<path d="M${s / 2} ${s * 0.88}V${s * 0.2}" ${stroke(s * 0.04)}/>` +
    [0.3, 0.46, 0.62]
      .map(
        (y, i) =>
          `<path d="M${s / 2} ${s * (y + 0.1)}Q${s * 0.26} ${s * y} ${s * (0.22 - i * 0.02)} ${s * (y - 0.08)}M${s / 2} ${s * (y + 0.1)}Q${s * 0.74} ${s * y} ${s * (0.78 + i * 0.02)} ${s * (y - 0.08)}" ${stroke(s * 0.035)}/>`,
      )
      .join(''),
};
const KEYS = Object.keys(MOTIFS);

/** Same seed, same cloth: a small linear congruential generator. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const cache = new Map<string, string>();

/**
 * A cloth of `cols` x `rows` squares, stretched to cover its box. `opacity` is the motif
 * strength; seams are drawn slightly stronger, like the dotted resist lines on real adire.
 */
export function cloth(cols: number, rows: number, seed = 2, opacity = 0.13): string {
  const key = `${cols}:${rows}:${seed}:${opacity}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = 120;
  const R = rng(seed);
  let squares = '';
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const k = KEYS[(x * 2 + y * 3 + Math.floor(R() * 2)) % KEYS.length] ?? 'rings';
      const a = (opacity * (0.8 + R() * 0.4)).toFixed(3);
      squares += `<g transform="translate(${x * s} ${y * s})" opacity="${a}">${MOTIFS[k]?.(s) ?? ''}</g>`;
    }
  let seams = '';
  for (let x = 1; x < cols; x++) seams += `<path d="M${x * s} 0V${rows * s}"/>`;
  for (let y = 1; y < rows; y++) seams += `<path d="M0 ${y * s}H${cols * s}"/>`;
  const svg = `<svg class="cloth-svg" viewBox="0 0 ${cols * s} ${rows * s}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g filter="url(#dye)">${squares}<g stroke="currentColor" stroke-width="2.4" stroke-dasharray="1 9" stroke-linecap="round" opacity="${(opacity * 1.6).toFixed(3)}">${seams}</g></g></svg>`;
  cache.set(key, svg);
  return svg;
}

/** The pattern layer for a `.cloth` section. */
export const pattern = (cols: number, rows: number, seed?: number, opacity?: number): string =>
  `<div class="pat" aria-hidden="true">${cloth(cols, rows, seed, opacity)}</div>`;

/** One motif on its own, for small markers. */
export const motif = (name: keyof typeof MOTIFS | string): string =>
  `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">${MOTIFS[name]?.(100) ?? ''}</svg>`;

/** The pass's cloth panel: each square is its own group so it can draw in one by one. */
export function passCloth(cols = 4, rows = 2, seed = 3): string {
  const s = 120;
  const R = rng(seed);
  let o = '';
  let i = 0;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const k = KEYS[(x * 2 + y * 3 + Math.floor(R() * 2)) % KEYS.length] ?? 'rings';
      o += `<g class="sq" style="--i:${i++}" transform="translate(${x * s} ${y * s})">${MOTIFS[k]?.(s) ?? ''}</g>`;
    }
  let seams = '';
  for (let x = 1; x < cols; x++) seams += `<path d="M${x * s} 0V${rows * s}"/>`;
  for (let y = 1; y < rows; y++) seams += `<path d="M0 ${y * s}H${cols * s}"/>`;
  return `<svg class="cloth-svg" viewBox="0 0 ${cols * s} ${rows * s}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g opacity=".55">${o}</g><g stroke="currentColor" stroke-width="2.4" stroke-dasharray="1 9" stroke-linecap="round" opacity=".6">${seams}</g></svg>`;
}
