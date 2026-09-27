# Design System

> Extracted from a visual reference mockup (`Main.dc.html`, non-functional). Read by `/frontend` when building UI components.
> Style direction: warm, "Manufaktur" / artisanal feel — not a generic cold admin dashboard.

## Colors

| Token | Value | Usage |
|---|---|---|
| Background | `#F6F1EA` | Page background (warm cream) |
| Foreground / Text | `#2B1D16` | Primary text (dark brown) |
| Muted text | `#6B5A4E` | Secondary text, labels, meta info |
| Accent (primary) | `#A4532A` | Buttons, active nav, links on hover — configurable, alternates: `#7A4A2E`, `#2F5D50`, `#8C3B4A` |
| Sidebar background | `#EFE6DA` | Sidebar / nav panel |
| Sidebar border | `#E1D4C4` | Borders within sidebar |
| Card background | `#FFFDF9` | Cards, panels, inputs |
| Card border | `#E4D9CC` | Card/table borders |
| Progress track | `#EDE3D6` | Progress bar background |
| Progress fill (default) | `#6B4A3A` | Progress bar fill |
| Progress fill (low/warning) | `#C2410C` | Stock below minimum, etc. |
| Warning text | `#9A3412` | Overdue, blocked, below-minimum labels |
| Avatar background | `#6B4A3A` | User avatar circle |
| Footer/user-card background | `#E6DACB` | Bottom sidebar user block |

**Status pill colors** (e.g. QS/approval states):
- Freigegeben (approved/free): bg `#E3EFE7`, fg `#1F5138`
- In Prüfung (pending): bg `#F6EAD3`, fg `#7A4A0E`
- Gesperrt (blocked): bg `#F8DDD3`, fg `#8A2A0F`

## Typography

- **Headings / display:** `Fraunces` (serif, Google Font), weight 500–600. Used for page titles, section headings, big KPI numbers. Gives the "artisanal manufaktur" character.
- **Body / UI:** `Instrument Sans` (Google Font), weight 400–600, falls back to `Segoe UI, system-ui, sans-serif`.

## Layout & Component Style

- **Sidebar navigation**: fixed-width (~248px) left sidebar, icon + label nav items, active item has white card background + border; logo/brand block at top, user profile block pinned to bottom.
- **Cards**: white/cream background (`#FFFDF9`), 1px border (`#E4D9CC`), border-radius ~18px, generous padding (~24px).
- **KPI stat tiles**: big serif number, small muted label above, optional progress bar + caption below.
- **Tables/lists**: header row in uppercase, small, muted, letter-spaced; rows separated by thin borders, no zebra striping.
- **Buttons**: solid accent-colored, white text, rounded (~12px), medium font-weight.
- **Status badges**: pill-shaped (`border-radius: 999px`), colored background/text pairs per status (see above).
- **Border radius scale**: ~10-12px for interactive controls, ~18px for cards/containers.
- **Progress bars**: thin (6-8px), fully rounded, track in light tan, fill in accent brown (or warning orange when below threshold).

## Notes for `/frontend` and shadcn/ui

- shadcn/ui defaults (slate/zinc palette, Inter font) must be **re-themed**: override Tailwind CSS variables (`--background`, `--foreground`, `--primary`, `--border`, `--radius`, etc.) to match the tokens above instead of using shadcn defaults as-is.
- Load `Fraunces` and `Instrument Sans` via `next/font/google`.
- The reference mockup is **visual only** — no functional behavior, component structure, or data model should be copied from it, only look & feel.
