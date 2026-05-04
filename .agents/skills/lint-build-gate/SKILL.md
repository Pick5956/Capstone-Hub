---
name: lint-build-gate
description: Use before reporting a frontend code change as complete. Runs `npm run lint` and `npm run build` from the frontend directory, then clearly distinguishes new errors from pre-existing ones. Prevents regressions from being missed and prevents pre-existing errors from being mistaken for regressions.
---

# Lint/Build Gate Skill

Code changes in `frontend/` aren't done until lint and build pass — and you can prove it.

## When to invoke

After any code change in `frontend/`, before reporting "done" to the user. Always.

## Commands

Run from the project root, not `frontend/`:

```bash
cd d:/Term3.2568/PreCap/Restaurant-Management/frontend && npm run lint 2>&1 | tail -40
cd d:/Term3.2568/PreCap/Restaurant-Management/frontend && npm run build 2>&1 | tail -25
```

Or chain them:
```bash
cd d:/Term3.2568/PreCap/Restaurant-Management/frontend && npm run lint 2>&1 | tail -30 && echo --- && npm run build 2>&1 | tail -10
```

Build timeout: budget 300000ms (5 min). Lint usually <1 min.

## Pre-existing errors (NOT regressions)

As of 2026-05-02, the following errors exist in main and should not be reported as new:

| File | Error |
|---|---|
| `frontend/src/providers/ThemeProvider.tsx:21,24` | `react-hooks/immutability` — `apply` accessed before declared (3 errors stem from this one root cause) |

If lint output contains only these, the change is clean.

## How to report results

Use this format:

```
Build ✓ (or ✗ with reason)
Lint: <X new errors, Y new warnings, Z pre-existing>
```

Examples:

- **All clean**: `Build ✓ · Lint clean (0 new, 3 pre-existing in ThemeProvider)`
- **One new lint warning**: `Build ✓ · Lint: 1 new warning in <file>:<line> (unused var). Pre-existing: 3 in ThemeProvider.`
- **New error**: `Build ✗ · Lint: 1 new error in <file>:<line>: <message>. Need to fix before declaring done.`

## If a new error appears

1. Don't report success.
2. Identify which file and line the error is in (read the lint output carefully — match the file path against your changes).
3. If the error is in a file you just changed → fix it before reporting.
4. If the error appears in a file you didn't change → it's likely pre-existing or environmental; flag to the user but don't auto-fix unrelated files.

## What this skill does NOT do

- Doesn't run tests (no test setup yet).
- Doesn't check backend (`backend/`). For Go, the user will guide separately.
- Doesn't auto-format. If a lint rule wants reformatting, do it manually with the editor's tools — don't shell out to `eslint --fix` automatically (could touch files outside the scope of the change).

## Updating the pre-existing list

When the user fixes one of the pre-existing errors, update this skill file to remove it from the list. Otherwise the skill will keep tagging fixed errors as "pre-existing" and you'll miss real regressions in the same file.
