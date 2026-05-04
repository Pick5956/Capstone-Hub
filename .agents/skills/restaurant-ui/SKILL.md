---
name: restaurant-ui
description: Use when the user asks for UI/component/styling work in the Restaurant Hub frontend (Next.js + Tailwind v4) — designing pages, building components, fixing visual issues, redesigning sections, working on dashboard views, landing page, AuthModal, sidebar, or any visible surface. Enforces project-specific visual style (rounded-md, dark primary button, orange accent only, status colors only on data, no card-in-card) and prevents AI-SaaS-template patterns.
---

# Restaurant UI Skill

You're working on UI in a project with a strong, opinionated visual style. This skill keeps you aligned with it.

## Read first (if not already in context)

- `docs/wiki/conventions/visual-style.md` — the visual rulebook
- `docs/wiki/conventions/status-colors.md` — semantic color system
- `docs/wiki/conventions/ux-principles.md` — the *why* behind the rules

If the task touches a specific surface, also read:
- `/home` work → `docs/wiki/decisions/home-direction-operational.md`
- Landing work → `docs/wiki/decisions/landing-direction.md`
- AuthModal work → `docs/wiki/decisions/authmodal-theme.md`
- Sidebar work → `docs/wiki/decisions/sidebar-css-variable.md`

## Hard rules (non-negotiable)

**Radius**: `rounded-md` (6px) everywhere. Pills/badges can be `rounded`. Avatars/dots `rounded-full`. **NEVER** `rounded-xl`, `rounded-2xl`, `rounded-3xl` — these read as marketing.

**Primary button** (across landing, dashboard, AuthModal):
```tsx
className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-md hover:opacity-90"
```
No gradient buttons. No `hover:scale-105`. Allowed: `hover:opacity-90`, `group-hover:translate-x-0.5` on arrow icons.

**Color system**:
- **Brand accent**: orange (`orange-500/600`) — sparingly: brand mark, scroll progress, focus ring, active state, section labels.
- **Surfaces**: white / `slate-50` (light), `gray-950` / `gray-900` (dark).
- **Borders**: `gray-200` / `gray-800`.
- **Text**: `gray-900` / `white` primary, `gray-500` secondary, `gray-400` tertiary.
- **NEVER** use pink, purple, cyan, teal, indigo as primary palette. They're SaaS template tells.

**Status colors** (only on real status data, never as decoration):
- `emerald` → ready / available / live / good
- `amber` → cooking / occupied / warning
- `red` → overdue / critical / error
- `sky` → reserved / info
- `slate` → cleaning / neutral
- `orange` is **not** a status — it's brand accent

**No card-in-card.** Use sectioned borders inside one container instead of nesting card components.

**Tabular numbers** on every count, price, time, percentage: `tabular-nums`.

## Anti-patterns to refuse / refactor away

- Animated background blobs / multi-color gradient orbs
- `text-transparent bg-clip-text` for headlines
- Counter components animating to fake stats ("500+ users")
- Fake testimonials with invented names
- `transition-all duration-300` (be specific: `transition-[background-color,border-color]`)
- `rounded-3xl` cards
- Headers that animate height + add border simultaneously (causes seam — see `docs/wiki/gotchas/navbar-transition-seam.md`)

## Mobile is required

Every UI task verifies mobile before "done". Patterns:
- Order queue rows: 3-line stacked on `<sm`, table-like grid `≥sm`
- Sidebar: full nav on `≥lg`, hamburger drawer below
- Paired form fields (firstname/lastname): two columns desktop, one column mobile
- Touch targets: minimum `h-9` (36px)

## Copy

Thai language, restaurant operational context. Use:
- "ครัวกำลังทำ" not "Items in progress"
- "ของใกล้หมด" not "Low stock items"
- "โต๊ะรอเสิร์ฟ" not "Tables waiting"
- "เกินเวลา" / "พร้อมเสิร์ฟ" / "เปิดให้บริการ" / "รอบเย็นเริ่มแน่น"

## After the change

If something non-obvious was decided (a new pattern, a tradeoff, an avoided trap), file it into the wiki via the `wiki-keeper` skill — don't let it disappear into chat history.
