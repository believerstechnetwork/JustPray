# Just Pray

A free monthly prayer gathering for people in tech, run by [Believers Tech Network](https://believerstechnetwork.org).
This repo is the Just Pray website: public pages (home, reserve a seat, support, share) and an organiser view.

Reservations, contributions and the organiser view are backed by a small API (Netlify Functions,
TypeScript) and a Supabase Postgres database. Confirmation emails go out through Gmail or Resend.

## Going live (one-time setup)

1. **Database.** In Supabase, open SQL Editor, paste `supabase/schema.sql` and run it. It is safe to
   run again; it only creates what is missing. When an update changes `schema.sql`, run it again
   before merging that update: the changes are written so the live site keeps working meanwhile.
2. **Settings.** In Netlify, open Site configuration, then Environment variables, and add the
   variables listed in `.env.example`. Mark the keys and passwords as secret.
3. **Deploy.** Push to `main`. The site, the API (`/api/*`) and a daily keep-alive job (so Supabase's
   free plan does not pause the database) deploy together.
4. **Create the gathering.** Open `/#/admin`, sign in with `ADMIN_PASSWORD`, and save the Event
   editor with the title, date, start time (Lagos), venue and seats. Reservations stay closed until
   this is saved.

Until a setting is present, the matching feature says so instead of failing: no database means
"not connected yet", no bank details hide the transfer form, and no email settings mean bookings
still work but no email is sent (the organiser view shows a warning).

## How it works

- **Reserve a seat:** the server checks the details, then a database function hands out the next
  seat number. It locks the gathering row while doing so, so the capacity can never be exceeded. The
  confirmation email is sent after the response, so a slow mail server never delays the visitor. It
  has the pass details, Add to calendar (Google, or an `.ics` file from `/api/event.ics`), directions,
  and a private "Cancel my seat" link.
- **Cancel a seat:** the link carries a random token unique to each booking; only its SHA-256 hash is
  stored. Cancelling frees the seat at once, sends a short note, and keeps the person on the organiser
  list as Cancelled. Booking again with the same email gives back the same seat while seats remain.
  Cancelling closes an hour after the gathering starts.
- **Announcements** (`/#/admin` → Announcements): other BTN events, such as a conference. Fill in
  the event (theme and venue can be "to be announced"), pick a picture, write the email, and see
  it as it will arrive. "Send test" emails it to you first. Publishing asks who to send to
  (people who booked and asked for updates, people imported from Excel, or both), then lists the
  event on the home page until it ends.
- **Mailing list:** import people from an Excel or CSV file (a column of emails, names optional);
  the site shows what it found before anything is saved. Every announcement has a one-click
  unsubscribe link, and anyone who unsubscribes is never emailed one again or added back.
- **Sending:** announcement emails wait in an outbox. A first batch goes out on publishing, then
  `send-announcements` sends the next batch every two minutes, up to `ANNOUNCE_DAILY_LIMIT`
  (default 350) a day so Gmail's limit is never hit; a large list finishes the next day. Each
  person gets an email at most once: a send the mail service refused is retried (3 attempts in
  all), but one that may have gone out (a timeout, or a run that stopped mid-send) is not.
- **Support:** the giver picks naira or dollars, an amount, and enters their name and email. They get the
  account for that currency and a unique reference (for example `JP-7K3QX`) to put in the transfer
  description. "I've sent it" marks it as ready to check.
- **Organisers** (`/#/admin`, password from `ADMIN_PASSWORD`): totals per currency, reservations by
  day, attendee list with CSV download, a ledger to confirm each transfer against the bank
  statement, and the event editor. Only confirmed contributions count toward the totals.

## Getting started

Requires Node 22 (see `.nvmrc`).

```bash
npm ci
npm run dev
```

## Scripts

| Command                | What it does                                                      |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run dev`          | Vite dev server                                                   |
| `npm run build`        | Typecheck, then production build to `dist/`                       |
| `npm run check`        | Everything CI runs, except end-to-end tests                       |
| `npm test`             | Unit tests (Vitest)                                               |
| `npm run test:e2e`     | End-to-end tests (Playwright, desktop and mobile Chromium)        |
| `npm run lint`         | ESLint                                                            |
| `npm run format`       | Prettier (use `format:check` to verify)                           |
| `npm run check:assets` | Fails if an image in `src/assets` is over the size budget (1.2MB) |

For end-to-end tests, install the browser once with `npx playwright install chromium`.

## Local development

`npm run dev` and `npm run preview` serve `/api/*` from an in-memory backend
(`server/dev-api.ts`) with sample bank details, so no Supabase or email account is needed. Data
resets when the server restarts. The organiser password is `dev-password`. To run against the real
services instead, use `npx netlify dev` with the variables from `.env.example`.

## Project layout

```
src/
  main.ts          router (hash-based), event handling
  api.ts           calls to /api/*
  state.ts         UI state
  data/types.ts    shapes returned by the API
  lib/             pure helpers: formatting, validation (shared with the server), torn-paper edges
  views/           one module per page (cancel.ts: the "Cancel my seat" page)
  share.ts         share dialog and share-image generation
  assets/images/   web-sized photos (2400px max edge)
server/
  api.ts           every /api route, independent of Netlify so it is easy to test
  supabase-db.ts   storage on Supabase; memory-db.ts is the same rules in memory
  mailer.ts        Gmail (SMTP app password) or Resend
  emails.ts        the email templates (confirmation, cancellation, announcement)
  outbox.ts        sends queued announcement emails in batches, within the daily limit
  auth.ts          signed organiser session cookie
netlify/functions/
  api.mts          serves /api/*
  send-announcements.mts  every two minutes, sends the next batch of announcement emails
  keepalive.mts    daily query so the free database is not paused
supabase/
  schema.sql       tables, access rules and the reserve_seat function
tests/
  unit/            Vitest (API, storage mapping, validation, formatting)
  e2e/             Playwright, against the in-memory backend
```

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request to `main` (and on pushes to `main`):

| Job                     | Checks                                                  |
| ----------------------- | ------------------------------------------------------- |
| Lint, format & types    | Prettier, ESLint, `tsc`                                 |
| Unit tests              | Vitest                                                  |
| Build                   | Image size budget, production build (uploads `dist`)    |
| End-to-end (Playwright) | Desktop and mobile flows; uploads the report on failure |
| **CI passed**           | Gate job that is green only when all of the above are   |

New pushes to a PR cancel its older runs. To require CI before merging, add a branch protection rule
(or ruleset) for `main` that requires the **CI passed** status check and a pull request.

## Photos

Photos are from past BTN conferences. Originals are not stored in the repo; the committed files are
resized to a 2400px long edge at JPEG quality 88, with event watermarks cropped out.

## Design tooling

UI skills for AI coding agents live in `.claude/skills` (Impeccable plus a few of Emil Kowalski's
design-engineering skills) and in `.agents/skills` for tools that read that folder. They only guide
agents and are not part of the site, so lint and format checks skip them.

- Start a design session with `/impeccable init` in Claude Code. It writes `PRODUCT.md` and `DESIGN.md`.
- Impeccable's edit hooks are personal. They live in `.claude/settings.local.json`, which is
  git-ignored. Run `npx impeccable skills install` to set them up on your machine.
- `skills-lock.json` records where the Emil skills came from so they can be updated later.
