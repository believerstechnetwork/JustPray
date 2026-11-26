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
    await this.transport.sendMail({ from: this.from, replyTo: this.replyTo, ...email });
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
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
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
    if (!res.ok) throw new Error(`Resend returned HTTP ${res.status}`);
  }
}

/** Keeps emails in memory. Used in tests and local development. */
export class MemoryMailer implements Mailer {
  readonly kind = 'memory';
  sent: Email[] = [];
  async send(email: Email): Promise<void> {
    this.sent.push(email);
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
