import { describe, expect, it } from 'vitest';
import { latestGuard } from '../../src/lib/latest';

describe('latestGuard', () => {
  it('lets a read write when nothing newer arrived', () => {
    const g = latestGuard();
    let value = 0;
    const t = g.ticket();
    expect(g.applyRead(t, () => (value = 5))).toBe(true);
    expect(value).toBe(5);
  });

  it('stops an older read from replacing a newer booking count', () => {
    const g = latestGuard();
    let value = 0;
    const t = g.ticket(); // page load starts
    g.applyLatest(() => (value = 87)); // booking answers first
    expect(g.applyRead(t, () => (value = 86))).toBe(false); // slower page load
    expect(value).toBe(87);
  });

  it('does not let a failed request block a later successful read', () => {
    // Opening /#/admin signed out: the public load and the admin load start together,
    // the admin load fails (401), then the public load answers.
    const g = latestGuard();
    let value = 0;
    const publicTicket = g.ticket();
    g.ticket(); // admin load starts and fails: it never writes
    expect(g.applyRead(publicTicket, () => (value = 86))).toBe(true);
    expect(value).toBe(86);
  });

  it('lets only the first of two overlapping reads write', () => {
    const g = latestGuard();
    let value = 0;
    const a = g.ticket();
    const b = g.ticket();
    expect(g.applyRead(b, () => (value = 2))).toBe(true);
    expect(g.applyRead(a, () => (value = 1))).toBe(false);
    expect(value).toBe(2);
  });
});
