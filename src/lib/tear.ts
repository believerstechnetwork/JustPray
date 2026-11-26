/**
 * A deterministic torn-paper edge for the pass, as a clip-path polygon. Only the bottom edge
 * is torn; the same seed always gives the same edge, so the pass keeps its shape between renders.
 */
export function tearPolygon(seed: number): string {
  let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const teeth = 34;
  const points: Array<[number, number]> = [
    [0, 0],
    [100, 0],
  ];
  // Walk the bottom edge right to left, each tooth a little higher or lower (up to 4%).
  for (let i = teeth; i >= 0; i--) points.push([(i / teeth) * 100, 100 - rnd() * 4]);
  return `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`;
}
