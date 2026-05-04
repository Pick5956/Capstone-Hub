---
name: dashboard-page
description: Use when adding a new page under the dashboard (e.g. /orders, /tables, /menu, /inventory, /staff, /reports, /settings, /profile) or restructuring an existing one. Walks through the standard pattern: route group placement, layout reuse, sticky header, mock data with Thai/restaurant context, mobile layout, middleware protection, and post-change wiki note.
---

# Dashboard Page Skill

The Restaurant Hub dashboard has a settled pattern. New pages follow it; deviations need justification.

## Where the page lives

```
frontend/src/app/(dashboard)/<route>/page.tsx
```

The `(dashboard)` route group automatically wraps the page in `SidebarProvider + Sidebar + ContentWrapper`. You get the sidebar, mobile drawer, and content margin handling for free. Don't recreate any of this.

If the page name doesn't appear in the URL but does appear in navigation, the route group is correct (parens don't show up in URLs).

## Middleware protection

If the new route should require login (almost always yes), add it to `protectedRoutes` in `frontend/src/middleware.ts`. Otherwise, an unauthenticated visitor will land on it and the AuthProvider will mount in a partial state.

Current list (verify in code, may have grown):
```ts
['/home', '/orders', '/tables', '/menu', '/inventory', '/staff', '/reports', '/settings', '/dashboard', '/profile']
```

## Page structure

Use `(dashboard)/home/page.tsx` as the structural reference. Standard sections:

1. **Sticky header** — title in Thai, contextual meta (date / shift / live time), status pill if relevant, 1–2 primary actions max. Pin height with `h-14`, never animate height. Backdrop blur via `bg-white/95 dark:bg-gray-950/95 backdrop-blur`.

2. **Ops summary strip** (if the page has top-level metrics) — 4 inline stats with vertical dividers, **no card borders**. Each stat: small uppercase label, big tabular-num value, hint line. Use status tone for the value color when it expresses state.

3. **Main content area** — bordered sections with `rounded-md`. Header bar inside the section (px-4 py-3 border-b) + body. Avoid card-in-card.

4. **Side panel** (if useful) — vertical stack of related sections (alerts, reservations, recent activity).

## Mock data

Mock data must feel like a real restaurant, not generic dashboard demo numbers.

- Thai menu names: ผัดกะเพราหมู, ต้มยำกุ้ง, ข้าวมันไก่, ผัดไทย, ส้มตำไทย, แกงมัสมั่นเนื้อ, ข้าวผัดกุ้ง, สเต็กหมู
- Thai customer names: คุณสมชาย, คุณนภา, คุณอาทิตย์, คุณวิชัย, คุณแอน
- Realistic numbers: 13/20 tables, 5 in kitchen, 2 overdue, ฿18,640 shift revenue, 87 orders
- Times in 24h: 17:00, 18:30, 19:30, 21:00 (Thai dinner shift)
- Statuses: cooking / ready / delayed / served (orders); occupied / available / reserved / cleaning (tables)

Avoid: "Item 1, Item 2, Item 3", "$12,345.67", "John Doe", auto-generated lorem.

## Header pattern (copy this skeleton)

```tsx
<div className="sticky top-0 z-10 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800">
  <div className="px-5 md:px-7 h-14 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-[14px] font-semibold tracking-tight truncate">{pageTitle}</h1>
      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{contextLine}</p>
    </div>
    <div className="flex items-center gap-1.5">
      {/* primary actions, max 2 */}
    </div>
  </div>
</div>
```

## Mobile

Required. Patterns:
- Tables / list rows: stacked 3-line on `<sm`, grid `≥sm`
- Two-column forms: collapse to one column
- Header actions on mobile: icon-only with `aria-label`; show `<span className="hidden sm:inline">` for the label

Test by resizing browser to <640px. If the layout breaks, the task is not done.

## Charts

Recharts. Use `BarChart` with `Cell` for color coding (the deprecation hint is harmless — see `docs/wiki/gotchas/recharts-cell-deprecated.md`). Tooltip uses a custom small white card matching the visual style.

## After implementing

1. Run `npm run lint` and `npm run build` (use the `lint-build-gate` skill).
2. Verify mobile manually.
3. If anything non-obvious was decided (a new layout pattern, a data structure choice, a tradeoff), invoke `wiki-keeper` to file it into `docs/wiki/`.
