/**
 * Build a deterministic "torn paper" clip-path polygon. The same seed always
 * gives the same edge, so a card does not change shape between renders.
 */
export function tearPolygon(seed: number): string {
  let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const points: Array<[number, number]> = [];
  const nx = 44;
  const ny = 16;
  for (let i = 0; i <= nx; i++) points.push([(i / nx) * 100, rnd() * 2.6]);
  for (let i = 1; i <= ny; i++) points.push([100 - rnd() * 1.4, (i / ny) * 100]);
  for (let i = 1; i <= nx; i++) points.push([100 - (i / nx) * 100, 100 - rnd() * 2.6]);
  for (let i = 1; i < ny; i++) points.push([rnd() * 1.4, 100 - (i / ny) * 100]);
  return `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`;
}

/** Wrap HTML in a torn-paper card. */
export const torn = (seed: number, className: string, inner: string): string =>
  `<div class="torn-wrap"><div class="torn ${className}" style="clip-path:${tearPolygon(seed)}">${inner}</div></div>`;
