# Restaurant Hub — Project Context for Agents

This file is the shared entry point for AI agents working in this repo. It tells you what this project is, how it's organized, where to find context, and what to do (or not do) by default. Personal — not committed.

## What this is

Restaurant Hub is a restaurant management system. Pre-capstone solo project.

- **Frontend**: Next.js 16 (App Router, Turbopack) + React 19 + Tailwind v4 + Recharts. Located at `frontend/`.
- **Backend**: Go. Located at `backend/`.
- **Audience**: Restaurant owners and staff (Thai-language UI). Use cases focused on ops — order queues, table status, inventory, staff, reports.

The product direction is **operational, not analytical**. The dashboard answers "what's happening right now" before "how were sales last quarter".

## Where to find context

Three locations carry the project's accumulated knowledge. Read in this order at session start when relevant:

1. **`docs/wiki/`** — LLM-maintained dev wiki. Decisions, conventions, gotchas, architecture notes, ingested external sources. Start at `docs/wiki/index.md`. Schema in `docs/wiki/AGENTS.md`.
2. **`.claude/skills/`** — project-local skills. Auto-activate based on task type (UI work, new dashboard page, lint/build verification, wiki upkeep, Go backend). The folder name is legacy; the skills are shared project context.
3. **The codebase itself** — `frontend/src/`, `backend/`. Authoritative for "what the code does right now". The wiki is authoritative for "why we made it that way".

If a wiki page and the code disagree, the code wins for facts; the wiki wins for intent. Update the wiki rather than ignoring the discrepancy.

## Standing rules

- **Visual style** is non-negotiable. Default to `rounded-md`, dark primary button (`bg-gray-900 dark:bg-white`), orange accent only, status colors only on data. Full rules: `docs/wiki/conventions/visual-style.md`. Anti-patterns: `rounded-xl`+, gradient buttons, pink/purple/cyan as primary, fake testimonials/stats, card-in-card.
- **Mobile is required** for any UI work. Verify before declaring done.
- **No new dependencies** unless I explicitly approve. `lucide-react` v1.7 is in package.json but unreliable — use inline SVG instead.
- **Don't touch `auth` logic** unless the task is about auth. Login/register/token flow is settled.
- **Thai language UI**, English code/comments. Restaurant context for copy: "ครัวกำลังทำ", "ของใกล้หมด", "โต๊ะรอเสิร์ฟ" — not "Items in progress", "Low stock alerts", etc.

## Default workflow for code changes

1. Read relevant wiki pages and code before editing.
2. Make the smallest change that solves the problem. Don't refactor unrelated code.
3. After frontend changes: run `npm run lint` and `npm run build` from `frontend/`. Distinguish new errors from pre-existing.
4. After non-obvious decisions or gotchas surface: file into the wiki (see `wiki-keeper` skill).

## Pre-existing lint errors (not regressions)

Last seen 2026-05-02 — these are known and should not be reported as new:

- `frontend/src/providers/ThemeProvider.tsx:21,24` — `react-hooks/immutability`: `apply` accessed before declared. Functional but lint complains.

If lint shows only these, the build is clean.

## Tone

Brief. Direct. No corporate language. The user reads diffs and code; redundant prose is friction. Update memory of project state via the wiki, not by repeating context in every reply.

## What NOT to do

- Don't create `README.md`, planning documents, or summary `.md` files unless I ask.
- Don't add comments that restate what the code does.
- Don't commit anything unless I explicitly ask.
- Don't run `git push`, `git rebase`, `git reset --hard`, or any destructive git command without confirmation.
- Don't bypass hooks (`--no-verify`) ever, unless I tell you to.
- Don't install agent plugins or marketplace skills unless I approve. Project-local skills under `.claude/skills/` are fine.

## Stack-specific notes

- **Tailwind v4**: no `tailwind.config.js`. Config is in `frontend/src/app/globals.css` via `@custom-variant`, `@theme inline`. Dark mode is class-based (`@custom-variant dark (&:where(.dark, .dark *))`).
- **React 19**: client components that mutate `<html>` need `suppressHydrationWarning` on the `<html>` element.
- **Sidebar**: width is driven by a CSS variable `--sidebar-w` on `<html>`, not React state. Do not rewire to context — see `docs/wiki/decisions/sidebar-css-variable.md`.
- **Routing**: `(dashboard)` route group adds the sidebar layout; `/` (landing) does not. Middleware redirects authenticated visitors away from `/` and unauthenticated visitors away from dashboard routes.
- **Auth**: modal-driven, no `/login` page. `useAuth().openLoginModal()` opens it.
- **Google auth**: Google Identity Services is wired into AuthModal. Frontend posts `id_token` to `POST /api/google-login`; backend verifies it against `GOOGLE_CLIENT_ID` and Google's JWKS without adding a new Go dependency. New Google users have no global role; restaurant roles live on `restaurant_members`. See `docs/wiki/architecture/routing-and-auth.md`.
- **Multi-tenant Phase A**: Users can own/join many restaurants. Restaurant selection lives at `/restaurants`; dashboard routes require `active_restaurant_id`. `Restaurant` stores `open_time`, `close_time`, and `table_count`. Simple `invite_code` is a temporary Phase A bridge and should only be visible to owner/manager roles before Phase B replaces it with invitation tokens.
- **Invitation Phase B**: `/staff` is the real team/invitation page. It lists restaurant members, creates token invites with role/email/expiry, copies links, and revokes pending invitations. `/invitations/[token]` accepts real tokens after login and then selects the restaurant.
- **Sprint 2 Menu/Table**: `/menu` and `/tables` are real backend-backed dashboard pages. Backend resources are `Category`, `MenuItem`, and `RestaurantTable`, all scoped by `restaurant_id` from `X-Restaurant-ID`. Menu image upload uses `POST /api/v1/menu-items/upload-image`, stores files under `backend/uploads/menu/{restaurant_id}`, and serves them from `/uploads/...`.
- **Select controls**: Do not add native `<select>` UI. Use `frontend/src/components/shared/ThemedSelect.tsx` so dropdowns match the app theme; `rg "<select"` should stay empty for TSX unless there is a deliberate exception.
- **Backend env**: `backend/.env` must be parseable by `godotenv`; metadata lines must be comments starting with `#`, not `--`. See `docs/wiki/gotchas/backend-env-godotenv.md`.
