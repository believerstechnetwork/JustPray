/** Input validation for the public forms. Mirrors the HTML constraints so the
 *  same rules hold when the browser's own validation is bypassed. */

export type Currency = 'NGN' | 'USD';
export const CURRENCIES: readonly Currency[] = ['NGN', 'USD'];
export const CURRENCY_SYMBOL: Record<Currency, string> = { NGN: '₦', USD: '$' };

/** Smallest and largest contribution, in whole naira or dollars. */
export const CONTRIBUTION_LIMITS: Record<Currency, { min: number; max: number }> = {
  NGN: { min: 100, max: 10_000_000 },
  USD: { min: 1, max: 50_000 },
};
export const MIN_CONTRIBUTION = CONTRIBUTION_LIMITS.NGN.min;

/** Same rule as the phone input's `pattern` attribute. */
export const PHONE_PATTERN = '[+]?[0-9][0-9 ]{8,18}';
const PHONE_RE = new RegExp(`^${PHONE_PATTERN}$`);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegistrationInput {
  name: string;
  email: string;
  phone: string;
  privacy: boolean;
  updates: boolean;
}

export type RegistrationField = 'name' | 'email' | 'phone' | 'privacy';

export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E };

/** Anything with FormData's `get`, so the browser (FormData) and the server
 *  (parsed JSON, see `fieldsOf`) share one set of rules. */
export interface Fields {
  get(name: string): FormDataEntryValue | null;
}

/** Wrap a parsed JSON body so it reads like FormData. `true` reads as a ticked
 *  checkbox; `false`, missing and non-string values read as empty. */
export const fieldsOf = (body: unknown): Fields => {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return {
    get: (name) => {
      const v = o[name];
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      return v === true ? 'on' : null;
    },
  };
};

const str = (v: FormDataEntryValue | null): string => (typeof v === 'string' ? v.trim() : '');

export const isValidEmail = (email: string): boolean => EMAIL_RE.test(email.trim());

export const isValidPhone = (phone: string): boolean => PHONE_RE.test(phone.trim());

/** Collapse runs of spaces so stored numbers are consistent. */
export const normalisePhone = (phone: string): string => phone.trim().replace(/\s+/g, ' ');

export function validateRegistration(
  data: Fields,
): Result<RegistrationInput, Partial<Record<RegistrationField, string>>> {
  const value: RegistrationInput = {
    name: str(data.get('fullName')).replace(/\s+/g, ' '),
    email: str(data.get('email')).toLowerCase(),
    phone: normalisePhone(str(data.get('phone'))),
    privacy: data.get('privacy') !== null,
    updates: data.get('updates') !== null,
  };
  const errors: Partial<Record<RegistrationField, string>> = {};
  if (value.name.length < 2) errors.name = 'Enter your full name.';
  if (!isValidEmail(value.email)) errors.email = 'Enter a valid email address.';
  if (!isValidPhone(value.phone))
    errors.phone = 'Enter a WhatsApp number with country code, for example +234 801 234 5678.';
  if (!value.privacy) errors.privacy = 'Please agree so we can manage your reservation.';
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export interface ContributionInput {
  currency: Currency;
  amount: number;
  name: string;
  email: string;
}

export function validateContribution(data: Fields): Result<ContributionInput, string> {
  const rawCurrency = str(data.get('currency')).toUpperCase() || 'NGN';
  if (!CURRENCIES.includes(rawCurrency as Currency))
    return { ok: false, errors: 'Choose naira or dollars.' };
  const currency = rawCurrency as Currency;
  const { min, max } = CONTRIBUTION_LIMITS[currency];
  const sym = CURRENCY_SYMBOL[currency];
  const amount = Number(str(data.get('amount')));
  const name = str(data.get('name')).replace(/\s+/g, ' ');
  const email = str(data.get('email')).toLowerCase();
  if (!Number.isFinite(amount) || amount < min)
    return { ok: false, errors: `Enter at least ${sym}${min.toLocaleString('en-NG')}.` };
  if (!Number.isInteger(amount))
    return {
      ok: false,
      errors: `Enter a whole number of ${currency === 'NGN' ? 'naira' : 'dollars'}.`,
    };
  if (amount > max)
    return {
      ok: false,
      errors: `For gifts above ${sym}${max.toLocaleString('en-NG')}, please contact the organisers.`,
    };
  if (name.length < 2) return { ok: false, errors: 'Enter the name on your bank account.' };
  if (!isValidEmail(email)) return { ok: false, errors: 'Enter a valid email for your receipt.' };
  return { ok: true, value: { currency, amount, name, email } };
}
