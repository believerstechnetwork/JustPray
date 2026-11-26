import nodemailer, { type Transporter } from 'nodemailer';
import type { Email, Mailer } from './types';

export interface MailEnv {
  GMAIL_USER?: string;
  GMAIL_APP_PASSWORD?: string;
  RESEND_API_KEY?: string;
  /** Sender for Resend, e.g. "Just Pray <hello@mail.example.org>". Must be on a verified domain. */
  EMAIL_FROM?: string;
  /** Display name for the sender. */
  EMAIL_FROM_NAME?: string;
  /** Where replies go. Defaults to the Gmail address. */
  EMAIL_REPLY_TO?: string;
}

const DEFAULT_NAME = 'Just Pray';
/** Longest one Gmail send may take, start to finish. */
export const GMAIL_SEND_DEADLINE_MS = 12_000;

/** Gmail through SMTP with an app password. */
export class GmailMailer implements Mailer {
  readonly kind = 'gmail';
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly replyTo: string | undefined;

  constructor(user: string, appPassword: string, fromName = DEFAULT_NAME, replyTo?: string) {
    this.transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass: appPassword.replace(/\s+/g, '') },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    this.from = `"${fromName.replace(/"/g, '')}" <${user}>`;
    this.replyTo = replyTo;
  }

  async send(email: Email): Promise<void> {
    // Gmail has no idempotency keys, so the key is not passed on.
    const { to, subject, text, html, headers } = email;
    await this.transport.sendMail({
      from: this.from,
      replyTo: this.replyTo,
      to,
      subject,
      text,
      html,
      headers,
      // A deadline for the whole SMTP exchange, not just each step, so a send started near the
      // scheduled sender's 15-second budget still ends inside the platform's 30-second limit.
      // An aborted send may have been accepted, so it is closed as failed, not retried.
      signal: AbortSignal.timeout(GMAIL_SEND_DEADLINE_MS),
    });
  }

  /** Safe to send again only when Gmail refused the message (it answered with an SMTP code) or
   *  it never got that far (sign-in, address or DNS failure). A timeout or a dropped connection
   *  may come after Gmail accepted it, so those are not retried. */
  canRetry(error: unknown): boolean {
    const e = (error ?? {}) as { responseCode?: unknown; code?: unknown };
    return (
      typeof e.responseCode === 'number' || ['EAUTH', 'EDNS', 'EENVELOPE'].includes(String(e.code))
    );
  }

  /** Gmail's daily sending limit (550 5.4.5) or a temporary rate limit (421 / 4.7.0). */
  isQuota(error: unknown): boolean {
    const e = (error ?? {}) as { responseCode?: unknown; response?: unknown; message?: unknown };
    const text = `${String(e.response ?? '')} ${String(e.message ?? '')}`;
    return e.responseCode === 421 || /\b(5\.4\.5|4\.7\.0)\b|sending limit|rate limit/i.test(text);
  }
}

/** Resend's HTTP API. Needs a verified sending domain. */
export class ResendMailer implements Mailer {
  readonly kind = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  async send(email: Email): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(email.idempotencyKey ? { 'Idempotency-Key': email.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
        // e.g. List-Unsubscribe on announcements, so mail apps show their Unsubscribe button.
        ...(email.headers ? { headers: email.headers } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok)
      throw Object.assign(new Error(`Resend returned HTTP ${res.status}`), { status: res.status });
  }

  /** Safe to send again only when Resend answered and refused the email (a 4xx such as 429
   *  "slow down", but not 408 or 409). A timeout, a dropped connection or a 5xx may come after Resend took it, and
   *  the idempotency key only lasts 24 hours while a queued retry can wait longer behind the
   *  daily limit, so those are not retried. */
  /** 429: Resend's rate limit or daily quota. Nothing was sent. */
  isQuota(error: unknown): boolean {
    return (error as { status?: unknown } | null)?.status === 429;
  }

  canRetry(error: unknown): boolean {
    const status = (error as { status?: unknown } | null)?.status;
    // 408 (timed out) and 409 (another send with this key is still in progress) leave the
    // outcome open, so they are not retried either.
    return (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 409
    );
  }
}

/** Keeps emails in memory. Used in tests and local development. */
export class MemoryMailer implements Mailer {
  readonly kind = 'memory';
  sent: Email[] = [];
  async send(email: Email): Promise<void> {
    this.sent.push(email);
  }

  canRetry(): boolean {
    return true;
  }
}

/** Resend when it is configured, otherwise Gmail, otherwise null (email off). */
export function mailerFromEnv(env: MailEnv): Mailer | null {
  const replyTo = env.EMAIL_REPLY_TO || env.GMAIL_USER || undefined;
  if (env.RESEND_API_KEY && env.EMAIL_FROM)
    return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM, replyTo);
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD)
    return new GmailMailer(
      env.GMAIL_USER,
      env.GMAIL_APP_PASSWORD,
      env.EMAIL_FROM_NAME || DEFAULT_NAME,
      env.EMAIL_REPLY_TO || undefined,
    );
  return null;
}
