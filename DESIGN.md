# Design

The look of the battalion's own apps: the 40th's yellow flag with three red stripes (as on
40hercules.vercel.app), a calm centred sign-in (as on 40sar.vercel.app), and a timetable-first main
page in the spirit of NUSMods. **The stripes are the one bold element.** Everything else stays quiet
so a dense 15-column week reads at a glance.

Tokens live in `frontend/app/globals.css` (`@theme`). Card and chip colours are **settings**, not
tokens: admins change them on the Settings page.

## Colour

| Token | Value | Use |
|---|---|---|
| `canvas` | `#fef3c6` (amber-100) | Page background |
| `stripe` | `#fca5a5` at 50% (red-300/50) | The three flag stripes on the canvas |
| `ink` | `#1d1d1f` | Body text |
| `muted` | `#6e6e73` | Secondary text, times, counts |
| `heading` | `#7b3306` (amber-900) | Page titles and text sitting directly on the canvas |
| `hairline` | `#eadfbf` | Borders and grid lines (warm, so they sit on yellow) |
| `primary` | `#b42318` | The one action colour: Sign in, Save, Sync, focus rings |
| `primary-dark` | `#8f1c13` | Primary hover |

- Surfaces are plain white (`bg-white`) with a `hairline` border and `shadow-sm`. No gradients.
- Category colours (cards, legend) default to soft pastels: green Outfield, blue External, yellow PT,
  orange Live Firing, grey Off. A card's left border is the same colour mixed 55% toward ink.
- Company chips use the 40sar company colours by default (Archer `#fbe38e`, Braves `#f6b8b8`,
  Cougar `#b9e6c6`, Stallion `#bcd5f7`, Hercules `#1d1d1f`). Chip text is black or white,
  whichever contrasts (`inkOn()` in `SettingsContext.tsx`).
- Warnings use orange (`Notice`), confirmations green. The UNCERTAIN outline is orange-500.

### The stripes

One CSS background on `body.stripes`: a `linear-gradient(90deg, …)` with stripes at 34–41%,
42–58% and 59–66% of the width (narrow, wide, narrow), `background-attachment: fixed`. No extra
elements. Content cards cover most of the stripes on working pages; the sign-in page shows them in full.

## Type

- **Barlow** for UI and body text, and **Barlow Semi Condensed** (`font-display`) for headings,
  card titles and the unit mark. Both come from `next/font/google`. They are signage faces, which
  suits a military programme, and the condensed cut fits activity titles into narrow period columns.
- Scale (px): 11 / 12 / 13 / 14 / 15 / 17 / 20 / 26 / 44–56 (sign-in headline only).
- Times use `tabular-nums`. Activity titles stay upper case, as on the paper programme. Labels do not.

## Layout

- **Sign-in:** centred column, max 36rem. Unit mark (red tile, yellow lettering), "Good day,
  Commander", then a pill key field and a pill button side by side (wrapping on phones), with a faint note below.
- **Signed-in pages:** sticky white top bar (unit mark, Programme / Upload / Settings, and search on
  the programme page). Content max 1600px with 16px gutters.
- **Programme:** a toolbar card (title, company pills, Timetable/Upcoming toggle, week controls,
  Sync), then the week grid. Below it, NUSMods-style, one card per company listing the week's
  activities, and a category legend on the right (stacked on phones).
- **Timetable grid:** days are rows and periods are columns, with Remarks last. Overlaps stack in
  lanes. Today's row has a canvas tint and a red day name. The grid scrolls sideways below 1200px.
- **Settings:** one column, max 56rem, a card per group. When unlocked, a sticky save bar sits at the bottom.

## Shape and motion

- Radii: 8px inputs and cards inside the grid, 16px surfaces, full pills for buttons, tabs and chips.
- Motion only answers actions: `active:scale-95` on buttons, a brightness dip on card hover.
  `prefers-reduced-motion` turns all of it off.

## Accessibility

- Every control has a label (visible or `sr-only`). Pressed tabs use `aria-pressed`, and the
  current page uses `aria-current`.
- `:focus-visible` shows a 2px `primary` outline everywhere.
- Text on the canvas uses `heading` (amber-900), which passes AA on amber-100.
