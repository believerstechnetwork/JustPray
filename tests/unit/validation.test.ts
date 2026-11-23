import { describe, expect, it } from 'vitest';
import {
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
  it('accepts a valid contribution', () => {
    expect(validateContribution(form({ amount: '5000', email: 'a@b.co' }))).toEqual({
      ok: true,
      value: { amount: 5000, email: 'a@b.co' },
    });
  });
  it('enforces the minimum', () => {
    const r = validateContribution(form({ amount: '99', email: 'a@b.co' }));
    expect(r.ok).toBe(false);
  });
  it('rejects fractions, junk and bad emails', () => {
    expect(validateContribution(form({ amount: '100.5', email: 'a@b.co' })).ok).toBe(false);
    expect(validateContribution(form({ amount: 'abc', email: 'a@b.co' })).ok).toBe(false);
    expect(validateContribution(form({ amount: '500', email: 'bad' })).ok).toBe(false);
  });
});
