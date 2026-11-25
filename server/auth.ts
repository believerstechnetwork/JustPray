import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Organiser sessions: a signed expiry time in an HttpOnly cookie. The signing key
 *  comes from ADMIN_PASSWORD, so changing the password signs everyone out. */

export const SESSION_COOKIE = 'jp_admin';
export const SESSION_HOURS = 12;

const key = (password: string): Buffer =>
  createHash('sha256').update(`just-pray-admin:${password}`).digest();

const sign = (password: string, payload: string): string =>
  createHmac('sha256', key(password)).update(payload).digest('base64url');

const safeEqual = (a: string, b: string): boolean => {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
};

export const passwordMatches = (given: unknown, expected: string): boolean =>
  typeof given === 'string' && expected.length > 0 && safeEqual(given, expected);

export function createSession(password: string, now = Date.now()): string {
  const exp = String(now + SESSION_HOURS * 3600_000);
  return `${exp}.${sign(password, exp)}`;
}

export function sessionIsValid(
  token: string | null | undefined,
  password: string,
  now = Date.now(),
): boolean {
  if (!token || !password) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, sign(password, exp));
}

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** `secure` is off only for plain-http local development. */
export const sessionCookie = (token: string, secure: boolean): string =>
  `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`;

export const clearedCookie = (secure: boolean): string =>
  `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
