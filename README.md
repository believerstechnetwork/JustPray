# Just Pray

A free monthly prayer gathering for people in tech, run by [Believers Tech Network](https://believerstechnetwork.org).
This repo is the Just Pray website: public pages (home, reserve a seat, support, share) and an organiser view.

> **Status: demo mode.** There is no backend yet. Reservations and event edits are stored in the
> visitor's browser only, the organiser view has no login and shows sample data, and the payment flow is
> simulated (no money moves). Set `VITE_DEMO_MODE=false` to hide the demo banner and the design-example
> payment screen once a real backend and Paystack are connected.

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

## Configuration

| Variable         | Default                            | Purpose                                      |
| ---------------- | ---------------------------------- | -------------------------------------------- |
| `VITE_DEMO_MODE` | `true`                             | Demo banner, seeded seat count, sample admin |
| `VITE_SITE_URL`  | `https://believerstechnetwork.org` | Address used in share links                  |

## Project layout

```
src/
  main.ts          router (hash-based), event handling
  state.ts         UI state and the data store instance
  config.ts        capacity, demo mode, default event
  data/            Store interface and the browser-local implementation
  lib/             pure helpers: formatting, validation, torn-paper edges
  views/           one module per page
  share.ts         share dialog and share-image generation
  assets/images/   web-sized photos (2400px max edge)
tests/
  unit/            Vitest
  e2e/             Playwright
```

Swapping in a real backend means implementing the `Store` interface in `src/data/types.ts`.

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
