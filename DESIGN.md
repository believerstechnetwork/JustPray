---
name: Just Pray
description: A free monthly prayer afternoon for people in tech, on Adire cloth made from the BTN logo's dots and lines.
colors:
  indigo: '#0e2766'
  indigo-raised: '#16378c'
  btn-blue: '#0a6fc2'
  ivory: '#efe4cf'
  ivory-hover: '#f8f1e3'
  ivory-ink: '#0e2766'
  ivory-tint: '#f7f0e2'
  ivory-line: '#e2d3b4'
  cta-ink: '#f3ead9'
  canvas: '#f4f8fd'
  card: '#ffffff'
  ink: '#0d1a3a'
  ink-soft: '#4a5a7a'
  rule: '#dce5f2'
  field-line: '#c9d6e8'
  mute-tint: '#eef2f8'
  on-cloth: '#ffffff'
  on-cloth-soft: '#c5d6f2'
  ok: '#1e7f52'
  warn: '#8a5a00'
  bad: '#b3261e'
  canvas-dark: '#081128'
  card-dark: '#0f1e44'
  ink-dark: '#edf2fb'
  ink-soft-dark: '#a8b8d6'
  rule-dark: '#1f3263'
  field-line-dark: '#2f4479'
  mute-tint-dark: '#17284f'
  btn-blue-dark: '#7ab9f5'
  cloth-dark: '#12307a'
  ivory-tint-dark: '#2b2820'
  ivory-line-dark: '#5e5440'
  ok-dark: '#5fd39c'
  warn-dark: '#f5c25a'
  bad-dark: '#ff8a80'
typography:
  display:
    fontFamily: "'Young Serif', Georgia, serif"
    fontSize: 'clamp(56px, 7.4vw, 104px)'
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: '-0.015em'
  headline:
    fontFamily: "'Young Serif', Georgia, serif"
    fontSize: 'clamp(48px, 5.6vw, 76px)'
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: '-0.015em'
  section:
    fontFamily: "'Young Serif', Georgia, serif"
    fontSize: 'clamp(38px, 4.4vw, 56px)'
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: '-0.015em'
  title:
    fontFamily: "'Young Serif', Georgia, serif"
    fontSize: '30px'
    fontWeight: 400
    lineHeight: 1.05
  lead:
    fontFamily: "'Young Serif', Georgia, serif"
    fontSize: 'clamp(23px, 2.2vw, 30px)'
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: '17px'
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Figtree', system-ui, sans-serif"
    fontSize: '13px'
    fontWeight: 600
    letterSpacing: '0.06em'
  numeral:
    fontFamily: "'Young Serif', Georgia, serif"
    fontSize: '40px'
    fontWeight: 400
    lineHeight: 1
    fontFeature: 'tnum'
rounded:
  input: '12px'
  button: '14px'
  tag: '14px'
  tile: '18px'
  card: '20px'
  frame: '22px'
  seat: '50%'
spacing:
  field: '18px'
  gap: '28px'
  gutter: '48px'
  gutter-phone: '20px'
  section: '120px'
  section-phone: '72px'
components:
  button-primary:
    backgroundColor: '{colors.indigo}'
    textColor: '{colors.cta-ink}'
    rounded: '{rounded.button}'
    padding: '0 24px'
    height: '52px'
  button-primary-hover:
    backgroundColor: '{colors.indigo-raised}'
  button-primary-on-cloth:
    backgroundColor: '{colors.ivory}'
    textColor: '{colors.ivory-ink}'
    rounded: '{rounded.button}'
    padding: '0 24px'
    height: '52px'
  button-primary-on-cloth-hover:
    backgroundColor: '{colors.ivory-hover}'
  button-indigo:
    backgroundColor: '{colors.indigo}'
    textColor: '{colors.on-cloth}'
    rounded: '{rounded.button}'
    padding: '0 24px'
    height: '52px'
  button-indigo-hover:
    backgroundColor: '{colors.indigo-raised}'
  button-ghost:
    textColor: '{colors.ink}'
    rounded: '{rounded.button}'
    padding: '0 24px'
    height: '52px'
  button-small:
    rounded: '11px'
    padding: '0 16px'
    height: '44px'
  input-field:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.input}'
    padding: '0 16px'
    height: '52px'
  field-label:
    textColor: '{colors.ink-soft}'
    typography: '{typography.label}'
  card-panel:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '34px 34px 28px'
  cloth-field:
    backgroundColor: '{colors.indigo}'
    textColor: '{colors.on-cloth}'
  photo-tag:
    backgroundColor: '{colors.card}'
    textColor: '{colors.ink}'
    rounded: '{rounded.tag}'
    padding: '12px 16px'
  seat-light:
    rounded: '{rounded.seat}'
    size: '18px'
  seat-light-lit:
    backgroundColor: '{colors.ivory}'
    rounded: '{rounded.seat}'
    size: '18px'
  pass-seat-tag:
    backgroundColor: '{colors.ivory}'
    textColor: '{colors.ivory-ink}'
    rounded: '12px'
    padding: '10px 16px 8px'
---

# Design System: Just Pray

## Overview

**Creative North Star: "The Lit Seat on Adire Cloth"**

Just Pray is set on Adire eleko, the Yoruba indigo resist cloth, redrawn from the Believers Tech Network logo's own dots and lines: rings, dot grids, logo strands, combs, arcs and a leaf, faded white on deep indigo and joined by dotted seams. Warm ivory is the light: a lit seat, the action that lights one, and the few cues that show where you are, like cream paper against indigo ink. The world refuses both the cream-and-brown church page and the generic blue SaaS hero; it is a cloth people sit on, not a funnel.

Screens are minimal and calm. Each screen shows just enough information to act, with one primary action per region. Nothing is repeated, nothing is decorative for its own sake, and nothing is invented: no filler claims, made-up numbers or promises. Beauty comes from the cloth, the type, space and the real event photos. Indigo cloth bands alternate with a pale tinted canvas carrying white cards; the organiser pages are the same world, quieter.

Both light and dark modes are first-class. In dark mode the canvas sinks to near-black indigo, cards lift to deep navy, and the cloth itself brightens slightly so it still reads as a field.

**Key Characteristics:**

- Indigo cloth fields built from six BTN-derived motifs, generated, deterministic, always aria-hidden.
- Ivory is light, never decoration: lit seats, the Reserve action on cloth, the one lit word of a page headline, and interaction cues on cloth (focus, current page). On light grounds the main action is indigo with ivory text, and ivory is never used for words there.
- Young Serif headlines at large scale against Figtree text; hierarchy by size, never by weight.
- White cards on a tinted canvas, lifted by one soft blue shadow; stitched dashed borders on frames and tags.
- The BTN logo only top left and in the footer, on cloth, never on a card.
- The torn edge belongs to the pass alone. Motion plays once, then stops.

## Colors

BTN blue and white lead; indigo is the cloth; one warm accent, ivory, is rationed to the meaning of light. (Earlier versions used a marigold gold; it was replaced because it read loud on the indigo and weak on white.)

### Primary

- **Adire Indigo** (indigo): every cloth field (hero, goal band, verse, seat cloth, footer, account headers, organiser sidebar), the pass's cloth panel and the indigo button. In dark mode cloth fields use **Night Cloth** (cloth-dark) so they stay distinct from the canvas.
- **BTN Blue** (btn-blue): links and focus borders on white grounds, the copy hint, the loading spinner. Lifts to **Sky Signal** (btn-blue-dark) in dark mode.

### Secondary

- **Ivory** (ivory) with **Ivory Ink** (ivory-ink, indigo) text on it: a lit seat, the pass seat tag, and the primary action on an indigo region. On canvas and cards the primary action is **Indigo** with **CTA Ink** (cta-ink) text, flipping to ivory with indigo text in dark mode. Its tint (ivory-tint, ivory-line) frames a notice or the transfer reference.

### Neutral

- **Tinted Canvas** (canvas): page ground between cloth bands. Dark: canvas-dark.
- **Card White** (card): panels, the reply slip, account cards, tags, the pass body. Dark: card-dark (the pass body stays white in both modes).
- **Deep Ink** (ink) and **Soft Ink** (ink-soft): text and secondary text on canvas and cards.
- **Rule** (rule), **Field Line** (field-line), **Mute Tint** (mute-tint): hairlines, input strokes, segmented-control wells.
- **On Cloth** (on-cloth) and **Cloth Mist** (on-cloth-soft): text on indigo, primary and secondary.
- **Status** (ok, warn, bad): organiser status dots and form errors only, each with its dark-mode lift.

### Named Rules

**The Lit Seat Rule.** Ivory is light. It marks a lit seat, the action that lights one (Reserve), and Free; the one lit word in a page headline ("pray.", the visitor's name on the pass); and cues that show where you are or what has focus: the focus ring, text selection, the current page and active tab, a selected amount in dark mode, and the seat tag on the pass. On light grounds those cues use BTN blue or indigo instead (chart bars, the share-picture ring). It never fills a decorative heading, an icon tile, a label or a background. Test: if the ivory element is not light (a seat, the Reserve action, the lit word, or a "you are here" cue on cloth), it should not be ivory.

**The One Light Rule.** One primary action per screen region. A region on indigo may carry a single ivory Reserve button; secondary actions there are underlined links.

**The Cloth Is Indigo Rule.** Motifs are white at low strength (0.06 to 0.22 opacity) on indigo. Never colour a motif, never put cloth on white.

## Typography

**Display Font:** Young Serif (with Georgia, serif)
**Body Font:** Figtree (with system-ui, sans-serif), weights 400 and 600 only

**Character:** a warm, slightly inky slab-serif for everything spoken aloud (headlines, names, seat numbers, codes) over a clean humanist sans that carries details precisely. Young Serif ships one weight; hierarchy is by scale alone.

### Hierarchy

- **Display** (400, clamp(56px, 7.4vw, 104px), 0.98, max 9ch): the first-viewport headline of a cloth hero; 48px on phones. Inner-page heroes step down to clamp(48px, 5.8vw, 84px).
- **Headline** (400, clamp(48px, 5.6vw, 76px)): the large section heads on the home page.
- **Section** (400, clamp(38px, 4.4vw, 56px)): standard section heads.
- **Title** (400, 23 to 30px): panel, card, tile and organiser block heads.
- **Lead** (Young Serif 400, clamp(23px, 2.2vw, 30px), 1.3, max 24ch): one framing sentence under a head.
- **Body** (Figtree 400, 17px, 1.6; 16px on phones): running text, 42 to 58ch.
- **Label** (Figtree 600, 12 to 13px, 0.06 to 0.12em, uppercase): form field labels, key-value terms, table heads and pass field names. Functional labels only, always attached to a value or input.
- **Numeral** (Young Serif, tabular figures): seat counts, the big date (clamp(120px, 15vw, 200px), 0.78, -0.04em; indigo in light mode, white in dark mode, never ivory), pass seat number and codes.

### Named Rules

**The Scale Not Weight Rule.** Headlines are Young Serif 400 at a larger size; never bold a headline and never set a headline in Figtree.

**The Tabular Rule.** Every count, code, amount and table uses tabular figures.

## Layout

A centred 1240px container with 48px gutters (20px on phones). Home sections breathe at 120px vertical padding (72px on phones); inner pages pull their content panel up over the cloth head by 44px so the form sits on the seam between cloth and canvas. Two-column splits (copy plus photo, intro plus panel) collapse to one column at 760px; navigation collapses to a Menu button at 980px.

On phones the reply slip follows the hero headline directly, before the photo, so booking needs no scroll. Tap targets are at least 44px; buttons are 52px. Organiser pages use a 252px cloth sidebar that becomes a scrolling tab row on phones, and tables become label-value cards.

**The Just Enough Rule.** Every screen shows only what is needed to act: no repeated information, no decorative sections, no filler copy, no invented testimonials, figures or promises. If a block restates something already on the screen, remove it.

## Elevation & Depth

Depth is quiet and tonal: cloth bands sit behind, white cards float on the canvas with one soft blue shadow, and tags float over photos. There are no hard offset shadows.

### Shadow Vocabulary

- **Card lift** (`0 1px 2px rgb(14 39 102 / 6%), 0 24px 48px -24px rgb(14 39 102 / 28%)`; dark: `0 1px 2px rgb(0 0 0 / 30%), 0 24px 48px -24px rgb(0 0 0 / 60%)`): panels, the slip, account cards, organiser tiles, seat cloth, photo frames on canvas.
- **Tag float** (`0 18px 36px -18px rgb(0 0 0 / 55%)`): white tags over a photo.
- **Ivory glow** (`0 0 12px rgb(239 228 207 / 45%)` on a lit seat): only on a lit seat, as the light it is. Primary buttons carry a soft dark drop shadow, not a glow.
- **Pass drop** (`drop-shadow(0 34px 40px rgb(0 0 0 / 45%))`): the pass, so the torn edge casts its own shadow.

### Named Rules

**The One Lift Rule.** A card has one shadow, the card lift. Do not stack borders and shadows on cards.

## Shapes

Soft, generous corners: inputs 12px, buttons and tags 14px, organiser tiles 18px, cards 20px, photo frames 22px; seats are circles. Stitching is the recurring silhouette: a 1.5px dashed inner border inset 4px on photo frames (white at 28% on cloth) and on tags (indigo at 20%), dotted seams between cloth squares, a dotted perforation across the pass.

**The Pass Alone Is Torn Rule.** The torn-paper bottom edge (a seeded clip-path, 34 teeth, up to 4% deep) appears on the pass and nowhere else. The pass is also the only rotated object (1.5deg on desktop, none on phones).

## Components

### Buttons

Confident, pill-adjacent, tactile.

- **Shape:** 14px radius, 52px tall, Figtree 600 17px; small variant 44px tall, 11px radius, 15px.
- **Primary:** the Reserve action. Indigo with ivory text on light grounds (hover indigo-raised); ivory with indigo text on the cloth (hover ivory-hover); ivory in dark mode.
- **Indigo:** the primary action on a white panel that is not Reserve (Show bank details, I’ve sent it). In dark mode it inverts to white with indigo text.
- **Ghost:** a 1.5px inset field-line stroke; hover turns the stroke BTN blue. Secondary organiser and reset actions.
- **Press:** scale(0.97) over 150ms on the shared ease.
- **Links:** Figtree 600, 1px underline offset 6px, 44px tall. The secondary action beside a button.

### Inputs / Fields

- **Style:** 52px, 12px radius, 1.5px field-line stroke on card white, 17px text; label above in the uppercase label style.
- **Focus:** stroke turns BTN blue with a 4px blue halo at 18%.
- **Error:** stroke turns bad red, a 14px 600 message below, linked by aria-describedby.

### Cards / Containers

- **Corner Style:** 20px (organiser tiles and blocks 18px).
- **Background:** card white / card-dark.
- **Shadow Strategy:** the card lift only; no border.
- **Internal Padding:** 34px on public panels (20 to 24px on phones), 20 to 24px on organiser blocks.

### Navigation

The top bar sits on the cloth of the first section, 92px tall (76px on phones): BTN logo, a hairline divider, "Just Pray" in Young Serif, links in cloth mist turning white, the current page underlined, and one small ivory Reserve button. Phones get a pill Menu button (icon and word, icon only under 370px) opening a white card list that ends in a full-width Reserve button. The footer is a cloth band with the logo, "Just Pray", and text links including the light/dark switch.

### Adire Cloth (signature)

Generated SVG: a grid of 120px squares, each one of six motifs (rings, dots, strands, comb, arcs, leaf), drawn white at a set strength with slight per-square variance, joined by dotted seams, roughened by a subtle displacement filter. Seeded, so the same section always weaves the same cloth. Hero cloths fade from left (22%) to right (full) so the headline reads. Single motifs mark list items in a dashed square.

### Seat Cloth (signature)

One 18px ring per seat (14px on phones) in a 12-column grid on indigo. Reserved seats light ivory in seat order, 14ms apart, once on load; the visitor's own seat carries an ivory outline ring. Beside it: "N seats left" in Young Serif and the ivory Reserve button.

### The Pass (signature)

A white ticket on the cloth: an indigo cloth panel with "Admit one" and the ivory seat-number tag, the name in Young Serif, a dotted perforation with half-circle notches, a label-value grid (code in Young Serif indigo), and the torn bottom edge. On arrival the pass rises in, the cloth squares draw in one by one, and the seat tag drops, once.

### Photo Frame and Tag

Real event photos only, in a translucent frame with a stitched inner border on cloth, or a plain 22px rounded crop with the card lift on canvas. A white tag with a calendar line icon carries the next gathering's date over the hero photo.

### Brand Mark

The BTN two-line lockup for indigo (btn-logo-ondark.png) appears in exactly two places: top left in the nav and in the footer, both directly on cloth. The vector marks and the white-ground lockup exist for the share image, icon and email.

## Do's and Don'ts

### Do:

- **Do** keep ivory to light: lit seats, the Reserve action on cloth, one lit headline word, and focus/current cues on cloth. Use ghost buttons or links for every other action.
- **Do** keep each screen to just enough information to act, with one primary action per region.
- **Do** build every cloth field from the generated Adire motifs at 0.06 to 0.22 strength on indigo.
- **Do** ship both modes: every surface reads in light and dark, with the dark tokens above.
- **Do** let motion play once on arrival (seats light, pass draws in, tag drops) on the shared ease cubic-bezier(0.2, 0.8, 0.2, 1), and stop all animation and transition under prefers-reduced-motion.
- **Do** use the real BTN Conference photos, credited, and Young Serif for names, numbers and codes.
- **Do** set copy with typographic quotes and apostrophes (“ ” ’), never straight ones.

### Don't:

- **Don't** use ivory to decorate (whole headings, icon tiles, labels, backgrounds), put ivory words on a light ground, or add a second primary button to a region.
- **Don't** place the BTN logo anywhere except top left and the footer, and never on a card, panel or white box.
- **Don't** use the torn edge on anything but the pass.
- **Don't** repeat information already on the screen, add decorative sections, or write filler copy, invented figures, testimonials or promises.
- **Don't** loop decorative motion; only a loading spinner may repeat.
- **Don't** put cloth on white, colour the motifs, or add hard offset shadows.
- **Don't** add small uppercase eyebrow labels above headings; uppercase is for field labels and terms only.
