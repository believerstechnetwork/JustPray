import { describe, expect, it } from 'vitest';
import { shareLinks } from '../../src/share';
import { tearPolygon } from '../../src/lib/tear';

describe('tearPolygon', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(tearPolygon(11)).toBe(tearPolygon(11));
    expect(tearPolygon(11)).not.toBe(tearPolygon(23));
  });
  it('returns a polygon() clip-path', () => {
    expect(tearPolygon(1)).toMatch(/^polygon\((\d+(\.\d+)?% \d+(\.\d+)?%,?)+\)$/);
  });
});

describe('shareLinks', () => {
  const links = shareLinks('Hello & welcome', 'https://example.org/a?b=1');
  it('encodes text and url', () => {
    expect(links.wa).toBe(
      'https://wa.me/?text=Hello%20%26%20welcome%20https%3A%2F%2Fexample.org%2Fa%3Fb%3D1',
    );
    expect(links.x).toContain('url=https%3A%2F%2Fexample.org%2Fa%3Fb%3D1');
  });
  it('covers every web target', () => {
    expect(Object.keys(links).sort()).toEqual(['fb', 'in', 'mail', 'tg', 'wa', 'x']);
  });
});
