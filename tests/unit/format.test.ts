import { describe, expect, it } from 'vitest';
import {
  dayOfMonth,
  esc,
  longDate,
  money,
  monthName,
  reservationCode,
  weekday,
} from '../../src/lib/format';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });
  it('turns null and undefined into an empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('money', () => {
  it('formats naira with thousands separators', () => {
    expect(money(5000)).toBe('₦5,000');
    expect(money(245000)).toBe('₦245,000');
  });
  it('treats missing values as zero', () => {
    expect(money(null)).toBe('₦0');
  });
});

describe('dates', () => {
  it('formats a long date', () => {
    expect(longDate('2027-01-30')).toMatch(/^Saturday,? 30 January 2027$/);
  });
  it('extracts parts without time zone drift', () => {
    expect(dayOfMonth('2027-01-30')).toBe(30);
    expect(weekday('2027-01-30')).toBe('Saturday');
    expect(monthName('2027-01-30')).toBe('January');
  });
});

describe('reservationCode', () => {
  it('pads the seat number', () => {
    expect(reservationCode(7)).toBe('JP-0007');
    expect(reservationCode(120)).toBe('JP-0120');
  });
});
