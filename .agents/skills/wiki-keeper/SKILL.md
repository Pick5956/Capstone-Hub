---
name: wiki-keeper
description: Use when something non-obvious was decided, learned, or fixed during a session — a design decision with tradeoffs, a gotcha that bit us, a reusable pattern, an external source worth tracking. Files it into the dev wiki under docs/wiki/ following the schema. Also use when ingesting external articles dropped into docs/wiki/raw/.
---

# Wiki Keeper Skill

The dev wiki at `docs/wiki/` is a personal, LLM-maintained knowledge base. It's git-ignored and used only by this developer. Your job: keep it current and well-organized.

## Read first

`docs/wiki/AGENTS.md` — the wiki's own schema. Has the page-type conventions, frontmatter format, and ingest/query/lint workflows. Re-read it if you haven't seen it this session.

## When to add a wiki page

Add when something is **non-obvious from the code**:

- A design decision with real tradeoffs (why we chose A over B)
- A gotcha that bit us (symptom → root cause → fix)
- A convention being established (a rule we'll reuse)
- An external source we want to track (article, paper, talk)
- An architecture overview that helps onboarding future-you

Don't add when:

- The code is already self-explanatory (`git blame` will tell the story)
- It's covered in framework docs (link instead)
- It's duplicating root `AGENTS.md` or `docs/wiki/AGENTS.md`

## Page types and locations

```
docs/wiki/
├── decisions/        # ADR-style: Context · Decision · Consequences · Alternatives
├── architecture/     # System shape: What · Why · Key files
├── conventions/      # Rules: Rule · When it applies · Examples
├── gotchas/          # Bugs/traps: Symptom · Root cause · Fix · How to spot it
├── sources/          # External material summaries with citation back to raw/
└── raw/              # IMMUTABLE source documents — never edit
```

## Frontmatter (every page)

```yaml
---
title: <human title>
type: decision | architecture | convention | gotcha | source
status: active | superseded | draft
updated: YYYY-MM-DD
tags: [list, of, tags]
---
```

After frontmatter: one-line italic summary (this becomes the hook in `index.md`), then the body sections appropriate to the type.

## Workflow: ingest a new wiki page

1. Pick the right type and folder.
2. Write the page with proper frontmatter + summary + body.
3. Cross-link to related pages using relative paths: `[sidebar jitter](../decisions/sidebar-css-variable.md)`.
4. **Update `docs/wiki/index.md`** — add the entry under the correct category. Format: `- [Title](relative/path.md) — one-line hook` (~150 chars max).
5. **Append to `docs/wiki/log.md`** — `## [YYYY-MM-DD] <op> | <title>` + 1–3 bullets describing what changed across the wiki.

## Workflow: ingest an external source

When the user says "ingest <file>" referring to something in `docs/wiki/raw/`:

1. Read the raw file. Do not modify it.
2. Discuss key takeaways with the user briefly before writing.
3. Create `sources/<slug>.md`:
   - Summary
   - What's worth borrowing (with how it maps to our codebase)
   - What's NOT worth copying
   - Open questions
   - Citation link back to `../raw/<filename>` (URL-encode spaces with `%20`)
4. Update or create related decision/convention/gotcha pages where the source teaches something concrete.
5. Update `docs/wiki/index.md` under `## Sources`.
6. Append to `docs/wiki/log.md`.

## Lint workflow (periodic health check)

When the user asks to lint the wiki:

- **Contradictions** between pages → flag, ask the user to resolve, mark loser as `status: superseded`.
- **Stale pages** (claims newer code/decisions invalidate) → update or supersede.
- **Orphan pages** (no inbound links from other pages) → either link them in or archive.
- **Concepts referenced but missing their own page** → propose to create.
- **Broken cross-links** → fix.
- Append a lint summary to `log.md`.

## Tone

Direct. Senior-engineer-leaving-notes. Not marketing copy. The wiki is for one reader (this developer) — assume context, skip platitudes, be specific. Code examples are encouraged when they make a rule concrete.

## What to avoid

- Don't write a page just because something happened. Trivial fixes don't need wiki entries — `git log` is enough.
- Don't write narratives covering 5 unrelated topics. One page = one thing.
- Don't duplicate framework documentation. Link to it.
- Don't let pages exceed ~300 lines. Split.
