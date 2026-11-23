/** Input validation for the public forms. Mirrors the HTML constraints so the
 *  same rules hold when the browser's own validation is bypassed. */

export const MIN_CONTRIBUTION = 100;

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

const str = (v: FormDataEntryValue | null): string => (typeof v === 'string' ? v.trim() : '');

export const isValidEmail = (email: string): boolean => EMAIL_RE.test(email.trim());

export const isValidPhone = (phone: string): boolean => PHONE_RE.test(phone.trim());

/** Collapse runs of spaces so stored numbers are consistent. */
export const normalisePhone = (phone: string): string => phone.trim().replace(/\s+/g, ' ');

export function validateRegistration(
  data: FormData,
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

export function validateContribution(
  data: FormData,
): Result<{ amount: number; email: string }, string> {
  const amount = Number(str(data.get('amount')));
  const email = str(data.get('email'));
  if (!Number.isFinite(amount) || amount < MIN_CONTRIBUTION)
    return { ok: false, errors: `Enter at least ₦${MIN_CONTRIBUTION}.` };
  if (!Number.isInteger(amount)) return { ok: false, errors: 'Enter a whole number of naira.' };
  if (!isValidEmail(email)) return { ok: false, errors: 'Enter a valid email for your receipt.' };
  return { ok: true, value: { amount, email } };
}
