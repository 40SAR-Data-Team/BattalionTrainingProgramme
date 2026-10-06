# Architecture

Next.js 16 (App Router) on Vercel, Neon Postgres, Google Calendar as the live source of truth,
OpenAI to read uploaded programmes. A Bun workspace with four packages and a database folder.

## Layout and ownership

| Folder | Package | Owns | May import |
|---|---|---|---|
| `shared/` | `@trng/shared` | Pure, client-safe code: `model.ts` (types), `settings.ts` (defaults + validation), `periods.ts` (grid ⇄ times), `drafts.ts` (draft/merge/de-dupe), `search.ts` (query language), `errors.ts` (`UserError`, `publicMessage`) | nothing |
| `backend/` | `@trng/backend` | Server-only: `db.ts` (Neon only), `settings.ts` (load/save), `secrets.ts` (encrypted keys), `session.ts` (sign-in + admin), `google.ts` (Calendar push/pull), `openai.ts` (prompt + call), `events.ts` (use cases: list, save, create, commit, delete, read upload; create reuses commit's validation and de-dupe) | `shared` |
| `frontend/` | `@trng/frontend` | Next app: routes in `app/`, UI in `components/`, thin server actions in `app/actions.ts`, `proxy.ts` (auth gate) | `shared`; `backend` from server files only |
| `database/` | none | `schema.sql` (idempotent, the only migration), `seed.sql` (dummy week, loaded only by the test fakes), `migrate.ts` | `backend/db.ts` |
| `tests/` | `@trng/tests` | `unit/`, `integration/` (fakes), `e2e/` (Playwright), `fakes/` (Neon, Google, OpenAI HTTP fakes; PGlite lives only here) | everything |

Client components (`"use client"`) must not import `@trng/backend` except with `import type`.

## Rules

- **Google wins.** App writes send `If-Match: etag`. A 412 triggers `syncAll()`, and the UI shows
  the Google version. `syncAll()` (incremental `syncToken` pull) runs on every page load.
- One `events` row may belong to many companies. Each company has its own Google copy, tracked in
  `events.google` as `{Company: {id, etag}}` and tagged `extendedProperties.private.trngEventId`.
- The AI reports only period spans. Times are computed in `shared/periods.ts` from the configured grid.
- **Settings over constants.** Companies, categories, periods, calendar naming and behaviour knobs
  live in the `settings` table (one `app` row), merged over `DEFAULT_SETTINGS` in
  `shared/settings.ts`. Read them with `getSettings()` on the server and `useSettings()` on the client.
  Add a setting in three places: the type in `shared/model.ts`, its default and validation in
  `shared/settings.ts`, and its field in `components/SettingsForm.tsx`.
  The root layout provides settings to the client only for signed-in browsers (the login page is public), with
  `calendarOwner` blanked; only an unlocked admin's Settings page receives it and `DEFAULT_SETTINGS`. Client code must
  not import `shared/settings.ts`, or the unit's defaults end up in public JS.
- **Secrets** (`ACCESS_KEY`, `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`) come from the
  Settings page first (AES-256-GCM in `secrets`, key derived from `ADMIN_KEY`), then from env.
  They are never sent to the browser. `DATABASE_URL` and `ADMIN_KEY` are env-only.
- Server actions and `/api/extract` are public endpoints: each one calls `requireUser()` or `requireAdmin()` first.
- **Sessions** (`backend/session.ts`): signed, expiring cookies, checked on every request against the key and the
  `revokedBefore` time (`settings` row `auth`, never cached). `proxy.ts` gates every page except `/login`, and sets a
  per-request nonce CSP on every page. Static security headers live in `next.config.ts`.
- **Errors**: only `UserError` (`shared/errors.ts`) text reaches the browser. `publicMessage()` logs anything else
  and returns a generic message.
- **Database**: the app runs as `trngprgm_app` (row read/write on its tables only). `database/migrate.ts` runs as the
  owner (`DATABASE_OWNER_URL`). `schema.sql` grants the app role and holds the `events` check constraints.
- New event attributes go in `events.attrs` (jsonb) until they need their own column. Schema
  changes go in `schema.sql` as `if not exists` statements.
- Test seams are environment, not code paths: `NEON_FETCH_ENDPOINT` sends Neon queries to the fake Neon (PGlite),
  `GOOGLE_API_ROOT` and `OPENAI_BASE_URL` point the API clients at fakes. All are env-only so an admin
  can never redirect stored keys to another server.
