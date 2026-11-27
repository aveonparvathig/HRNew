# Design System Master File — "Orchid"

> The single source of truth is `frontend/src/styles/01-tokens.css`. This file
> explains the tokens and the rules for using them. If the two disagree, the
> token file wins; fix this file.

**Project:** Aveon HR (payroll, people, leave, project billing)
**Look:** soft, rounded admin dashboard — borderless white cards on a light grey
page, a magenta-purple action colour, pill buttons and badges, a two-level sidebar.
**Dials:** Variance 3/10 · Motion 3/10 (short fades) · Density 7/10

---

## Colour tokens (light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F7F7` | `#1A1A1A` | Page background, icon rail |
| `--surface` | `#FFFFFF` | `#262626` | Cards, sub-menu panel, topbar controls |
| `--surface-2` | `#F7F7F7` | `#212121` | Input fill, table header fill |
| `--border` | `#ECECEC` | `#363636` | Dividers only — cards are borderless in light mode |
| `--text` / `--text-2` / `--text-3` | `#3D3D3D` / `#5C5C5C` / `#6E6E6E` | `#EDEDED` / `#C2C2C2` / `#949494` | Body, secondary, muted (all AA) |
| `--primary` | `#BB33AA` | `#D666CB` | Action colour, active nav, focus ring |
| `--primary-soft` | `#F8E8F5` | 14% primary | Active pill, tinted icon squares |
| `--accent` | `#8A4FD9` | `#A97CE6` | Violet secondary CTA (`.btn-accent`), at most one per view |
| `--success` / `--warning` / `--danger` / `--info` | text shades, each with `-soft` (fill) and `-dot` (bars, dots) | | Status |
| `--m-*` | purple, blue, green, amber, rose, violet, teal, cyan | | Charts and tone tiles (`.tone-*`) |

Accent presets live in `frontend/src/store/theme.ts` (`ACCENTS`) and are mirrored
in the boot script in `frontend/index.html`: Orchid (default), Blue, Violet,
Teal, Rose, Orange. A preset only re-paints the `--primary*` family.

## Typography

- Body: **Mulish** (`--font`), 14px base.
- Headings, page titles, card titles, stat values: **Urbanist** (`--font-heading`), 700.
- Figures: tabular numerals (`.num`, `.money`, `.stat-value`).

## Shape and depth

- Radii: `--radius-sm` 10px · `--radius` 14px · `--radius-lg` 18px (cards) · `--radius-xl` 22px (modals) · `--radius-pill` (buttons, badges, tabs, nav links).
- Shadows: `--shadow-sm` for resting cards, `--shadow-md` on hover, `--shadow-lg` for popovers. No hover lifts.

## Layout shell

- **Icon rail** (96px, page colour): logo, one button per nav section (icon above label), profile and sign-out at the bottom.
- **Sub-menu panel** (240px, white, `0 32px 32px 0` corners): the section title in primary, then its pages as pill links.
- **Collapsed** (`.app-shell.rail`): only the rail shows; picking a section opens its panel as a flyout.
- **Phone** (≤768px): a top bar with a menu button; the drawer holds the rail and panel side by side.
- Sections and their icons come from `navSectionsFor()` in `frontend/src/components/Layout/nav.tsx`.

## Components

- **Buttons:** pills. Primary = solid primary. Secondary = white with primary text and a soft primary border. Ghost = primary text.
- **Cards:** `.card`, `.stat-card`, `.table-card`, `.module-card`: borderless, `--radius-lg`, `--shadow-sm`, 24px padding.
- **Quick-action tile** (`.module-card`): 64px tinted icon square + title + one line of help.
- **Tabs / segmented:** pill tabs; segmented controls are a grey track with a white active pill.
- **Inputs:** filled `--surface-2`, 12px radius, primary border and ring on focus.
- **Tables:** transparent header, no vertical rules, row hover `--hover`.

## Rules

- Use tokens only — no hex colours in page CSS or TSX (print-only HTML excepted).
- Text contrast 4.5:1 minimum in both themes; `-dot` shades never carry text.
- SVG icons from the `Icon` set in `nav.tsx`; no emoji as icons.
- Visible focus (`--ring`), `prefers-reduced-motion` respected, no horizontal scroll at 375px.
