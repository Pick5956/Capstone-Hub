---
name: go-backend
description: Use when working on the Go backend in backend/ — adding endpoints, modifying handlers/repositories/models, debugging server-side issues, or integrating with the frontend's auth/API patterns. Establishes Go conventions, honors the API contract the frontend depends on, and keeps backend changes from silently breaking the frontend.
---

# Go Backend Skill

The Go backend is the source of truth for data and business logic. The frontend (Next.js) is a client — its `lib/auth.ts` and similar shape the API contract. Changes that break the contract break the frontend.

## Read first

- `frontend/src/lib/auth.ts` — what the frontend expects from the auth endpoints
- `frontend/src/types/auth.ts` — `User` type the frontend serializes/deserializes
- `frontend/src/app/repositories/authRepository.ts` — token storage shape
- `docs/wiki/architecture/routing-and-auth.md` — full auth flow including auto-login after register

If a backend conventions page exists at `docs/wiki/architecture/backend-stack.md`, read it. If it doesn't and you're about to establish a non-trivial Go pattern, create it (use `wiki-keeper`).

## Project layout (verify in code; this skill should be updated as the layout solidifies)

```
backend/
├── handlers/         # HTTP handlers — thin, parse → call repo → respond
├── repositories/     # Data access — DB queries, no HTTP concerns
├── models/           # Structs that map to DB rows / API JSON
├── middleware/       # Auth, CORS, logging
├── routes/           # Route registration
└── main.go
```

Adjust this skill if the actual layout differs.

## Conventions

**Handlers stay thin.** Parse request → validate → call repo → format response. No SQL, no business logic that spans entities.

**Repositories handle one entity.** `OrderRepository`, `TableRepository`, `MenuRepository`. They expose typed methods (`GetByID(id int)`, `Create(o *Order)`). They return `(result, error)`.

**Models are plain structs** with JSON tags. Match frontend type expectations exactly.

**Errors return JSON consistently**:
```json
{"error": "human message", "code": "MACHINE_CODE"}
```
Not free-form strings, not Go's default `error.Error()` exposed verbatim.

**HTTP status codes**: 200/201 success, 400 bad input, 401 unauthenticated, 403 unauthorized, 404 not found, 409 conflict (duplicate key), 500 server error. Don't return 200 with `{"error":...}` body — use the status code.

**Auth**:
- Token via `Authorization: Bearer <token>` header (frontend sends this from `authRepository`).
- Middleware validates and attaches user to context.
- Handlers read user from context; don't trust headers directly.

## Contract changes

Before changing an endpoint's request/response shape:

1. Identify all frontend callers (grep `frontend/src` for the endpoint path).
2. Plan the frontend update.
3. Change backend + frontend in the same session — never leave the contract broken.
4. If the change is breaking, prefer adding a new endpoint and migrating callers over mutating an existing one.

## Don't break

- The auth flow (`/login`, `/register`, `/roles`) is settled and the frontend's auto-login-after-register depends on it.
- Existing field names in `User` model (`sut_id`, `first_name`, `last_name`, `email`, `role_id`). Frontend serializes/deserializes these literally.

## Database

(Schema details TBD — add when the schema is settled. Until then, prefer reading existing migrations / models in `backend/` to inferring.)

## Tests

If a `_test.go` pattern is in use, follow it. If not, don't add a testing framework without confirming with the user — pre-capstone scope keeps tests minimal.

## Building & running

(Add the actual commands here once verified — likely `go run main.go` from `backend/` and `go build`. Update this skill when the user confirms.)

## After changes

- Backend changes touching auth/contract → run frontend build to confirm types still match (use `lint-build-gate`).
- Non-obvious Go patterns established → file into `docs/wiki/architecture/backend-stack.md` (use `wiki-keeper`).
- Don't run `go fmt` or `gofmt -w` on files you didn't touch.
