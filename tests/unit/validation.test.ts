import { describe, expect, it } from 'vitest';
import {
  fieldsOf,
  isValidEmail,
  isValidPhone,
  validateContribution,
  validateRegistration,
} from '../../src/lib/validation';

const form = (entries: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe('isValidPhone', () => {
  it.each(['+234 801 234 5678', '08012345678', '+2348012345678'])('accepts %s', (p) => {
    expect(isValidPhone(p)).toBe(true);
  });
  it.each(['', '12345', 'abc', '+234-801-234-5678', '+234 801 234 5678 ext 9'])(
    'rejects %s',
    (p) => {
      expect(isValidPhone(p)).toBe(false);
    },
  );
});

describe('isValidEmail', () => {
  it('accepts and rejects', () => {
    expect(isValidEmail('you@example.com')).toBe(true);
    expect(isValidEmail('you@example')).toBe(false);
    expect(isValidEmail('you example.com')).toBe(false);
  });
});

describe('validateRegistration', () => {
  const valid = {
    fullName: '  Ada   Obi ',
    email: ' Ada@Example.COM ',
    phone: '+234  801 234 5678',
    privacy: 'on',
  };

  it('normalises valid input', () => {
    const r = validateRegistration(form(valid));
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Ada Obi',
        email: 'ada@example.com',
        phone: '+234 801 234 5678',
        privacy: true,
        updates: false,
      },
    });
  });

  it('reports every invalid field', () => {
    const r = validateRegistration(form({ fullName: 'A', email: 'nope', phone: '1' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['email', 'name', 'phone', 'privacy']);
  });

  it('requires the privacy checkbox', () => {
    const f = form(valid);
    f.delete('privacy');
    const r = validateRegistration(f);
    expect(r.ok).toBe(false);
  });
});

describe('validateContribution', () => {
  const ok = { amount: '5000', name: ' Ada  Obi ', email: 'A@B.co' };
  it('accepts and normalises a valid contribution', () => {
    expect(validateContribution(form(ok))).toEqual({
      ok: true,
      value: { currency: 'NGN', amount: 5000, name: 'Ada Obi', email: 'a@b.co' },
    });
  });
  it('accepts dollars with their own limits, and rejects other currencies', () => {
    expect(validateContribution(form({ ...ok, currency: 'usd', amount: '1' }))).toMatchObject({
      ok: true,
      value: { currency: 'USD', amount: 1 },
    });
    expect(validateContribution(form({ ...ok, currency: 'USD', amount: '0' })).ok).toBe(false);
    expect(validateContribution(form({ ...ok, currency: 'USD', amount: '50001' })).ok).toBe(false);
    expect(validateContribution(form({ ...ok, currency: 'EUR' })).ok).toBe(false);
  });
  it('enforces the minimum and maximum', () => {
    expect(validateContribution(form({ ...ok, amount: '99' })).ok).toBe(false);
    expect(validateContribution(form({ ...ok, amount: '10000001' })).ok).toBe(false);
  });
  it('rejects fractions, junk, a missing name and bad emails', () => {
    expect(validateContribution(form({ ...ok, amount: '100.5' })).ok).toBe(false);
    expect(validateContribution(form({ ...ok, amount: 'abc' })).ok).toBe(false);
    expect(validateContribution(form({ ...ok, name: 'A' })).ok).toBe(false);
    expect(validateContribution(form({ ...ok, email: 'bad' })).ok).toBe(false);
  });
});

describe('fieldsOf', () => {
  it('reads JSON like FormData, with true as a ticked checkbox', () => {
    const f = fieldsOf({ a: 'x', n: 5, yes: true, no: false, obj: {} });
    expect([
      f.get('a'),
      f.get('n'),
      f.get('yes'),
      f.get('no'),
      f.get('obj'),
      f.get('missing'),
    ]).toEqual(['x', '5', 'on', null, null, null]);
  });
  it('validates a JSON registration the same way as a form', () => {
    const r = validateRegistration(
      fieldsOf({ fullName: 'Ada Obi', email: 'a@b.co', phone: '+234 801 234 5678', privacy: true }),
    );
    expect(r.ok).toBe(true);
  });
});
