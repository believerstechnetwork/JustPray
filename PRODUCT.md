# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Christian tech workers (engineers, designers, product managers, founders and others who build technology), starting in Lagos and open to people from anywhere who may join this or future gatherings. They mostly visit on their phones, often between work and home, and want one protected afternoon a month to pray with others who understand their work.

Organisers from Believers Tech Network (BTN) use the admin pages to set up each gathering, see reservations and confirm bank-transfer gifts.

## Product Purpose

Just Pray is a free, in-person prayer gathering held once a month (about 120 seats). The site lets people:

- see the next gathering (date, time, venue, seats left);
- reserve a free seat and get a confirmation email and a pass with a seat number and code;
- support the gathering by bank transfer to a naira or a dollar account, with a reference so organisers can match the gift.

Success: seats fill each month, attendees arrive with their pass, and gifts are matched and confirmed without back-and-forth.

## Positioning

A gathering for prayer, not a conference or a networking event. It is run by and for people in tech, who carry the specific pressures of that work (deadlines, layoffs, long commutes, the pressure to keep up). Scripture first, then personal and group prayer for work, homes and city.

## Operating Context

- Public pages: Home, Reserve a seat, You're in (the pass), Support.
- Organiser pages: sign-in, overview (seats, totals per currency), contributions (pending, confirmed, rejected), reservations (with CSV export), event settings (title, date, time, venue, capacity).
- Emails are sent from a Gmail account on booking.
- Gifts are by manual bank transfer. There is no card payment; organisers confirm each gift against the bank statement.

## Capabilities and Constraints

- Vite + TypeScript single-page app on Netlify, with Netlify Functions and a Supabase Postgres database (existing codebase).
- One event at a time, edited from admin; nothing about the event is hardcoded.
- Two currencies (NGN and USD), each with its own bank account; totals are kept per currency.
- Light and dark modes are both kept.
- Seats are numbered (1 to capacity). There is no seat selection or seating plan in the product.

## Brand Commitments

- Believers Tech Network: the logo is a blue gradient circuit-tree of lines and dots, with the wordmark "Believers Tech Network" in blue (about #1E90E6 to #0B7ACF) on white.
- Blue and white lead everywhere. One extra accent colour is allowed in small doses (user decision, 2026-11-25).
- Keep the existing event photos (BTN Conference 2025 and 2026); do not replace them yet.
- The torn-paper edge is kept on the pass only, and should feel beautiful, with motion that plays once.

## Evidence on Hand

- Real event photos in `src/assets/images/` (hero, verse, head1, head2, doneA, doneB, t1–t3, s1–s3) and the BTN logo (`logo.png`).
- Real copy on the home page (the burden, the goal, what we do, Ezekiel 22:30).
- No testimonials, attendance figures, partner logos or press exist. Do not invent them.

## Product Principles

1. Prayer is the point. Nothing on the page should feel like a sales funnel or a conference ad.
2. Reserving a seat takes seconds on a phone.
3. Giving is honest and simple: show the accounts, give a reference, confirm by hand.
4. Made by people in tech, for people in tech: precise and well made, never cold.
5. Minimal and calm: every screen shows just enough information to act, nothing decorative or repeated, and nothing invented (no filler claims, made-up numbers or promises). Beauty comes from colour, type, space and the real photos, not from extra elements (user decision, 2026-11-26).

## Accessibility & Inclusion

WCAG 2.1 AA. Many visitors are on phones in bright daylight or on the move, so contrast and tap targets matter. Animations must stop for people who turn off motion.
