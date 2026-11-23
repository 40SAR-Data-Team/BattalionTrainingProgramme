# BattalionTrainingProgramme — Developer Guide

Next.js 16 (App Router) + React 19 on Vercel, Neon Postgres, the Google Calendar API through a
service account, and the OpenAI Responses API. Use **bun** for everything. Read
[architecture_patterns.md](architecture_patterns.md) before changing code, and
[DESIGN.md](../DESIGN.md) before changing UI.

## Repository layout

```
frontend/   Next app — app/ (routes, server actions, /api/extract), components/, proxy.ts
backend/    server-only logic — db, settings, secrets, session, google, openai, events (use cases)
shared/     client-safe pure code — types, settings defaults/validation, period grid, drafts, search
database/   schema.sql (idempotent), seed.sql (dummy week for tests), migrate.ts
tests/      unit/, integration/, e2e/, fakes/ (fake Google Calendar + OpenAI servers)
docs/       user guide, this guide, architecture
```

It is a Bun workspace (`frontend`, `backend`, `shared`, `tests`). Bun installs each workspace's
dependencies in that workspace's own `node_modules`, so add a dependency to the package that
imports it (`cd backend && bun add …`).

## Setup

1. `bun install` at the repo root.
2. Copy `frontend/.env.example` to `frontend/.env.local` and fill it in:

   | Variable | Required | Notes |
   |---|---|---|
   | `DATABASE_URL` | yes | Neon connection string for the app's limited role `trngprgm_app` (see [Database access](#database-access)) |
   | `DATABASE_OWNER_URL` | local only | Owner connection string, used only by `database/migrate.ts`. Never set it on Vercel |
   | `ADMIN_KEY` | yes | Unlocks Settings and encrypts keys saved there. **Changing it makes saved keys unreadable**, and the app falls back to the env values below until an admin re-enters them |
   | `ACCESS_KEY` | * | Clerk sign-in key |
   | `GOOGLE_SERVICE_ACCOUNT_KEY` | * | Whole JSON key on one line |
   | `GOOGLE_CALENDAR_OWNER` | no | Google account that gets owner access to new calendars (the Settings value wins) |
   | `OPENAI_API_KEY` | * | |

   \* Can be set on the Settings page instead; a Settings value wins over env.
3. Create the tables: `bun --env-file=frontend/.env.local database/migrate.ts` (runs as `DATABASE_OWNER_URL`, else
   `DATABASE_URL`).
4. `bun run dev`, then open http://localhost:3000.

### Google Cloud

Enable the Google Calendar API, create a **service account**, and download a JSON key. No OAuth
client or consent screen is needed. On first sync the service account creates one calendar per
company (named by the **Calendar name** setting) and shares it with the calendar owner.

### Offline development

The app itself only talks to Neon. To try it with no Neon, Google or OpenAI account, run the test fakes
(`bun tests/fakes/serve.ts`: a seeded in-memory fake Neon on 4012, Google on 4010, OpenAI on 4011) and
start the app with:

```
DATABASE_URL=postgresql://fake:fake@fake-neon.local/fake
NEON_FETCH_ENDPOINT=http://localhost:4012/sql
GOOGLE_API_ROOT=http://localhost:4010/
OPENAI_BASE_URL=http://localhost:4011
```

The fake Neon is PGlite answering the Neon driver's HTTP protocol, so PGlite is a dependency of
`tests` only. Data is lost when the fakes stop. These addresses are environment-only on purpose: an
address editable in Settings could send the stored keys to any server.

## Commands

| Command | Does |
|---|---|
| `bun run dev` | Next dev server (frontend) |
| `bun run build` / `bun run start` | Production build / serve |
| `bun run lint` | ESLint (frontend) + `tsc` over backend, shared, tests, database |
| `bun run test` (or `bun test`) | Everything: unit, integration, then the Playwright suite (~2 min). Run `bunx playwright install chromium` once first. Stop any other `next dev` first |
| `bun run test:fast` | Unit + integration only (seconds) |
| `bun run test:e2e` | Playwright end-to-end tests only (files are `*.e2e.ts`; `tests/e2e/browser.test.ts` runs them from `bun test`) |
| `bun run db:migrate` | Apply `database/schema.sql` as `DATABASE_OWNER_URL` (else `DATABASE_URL`) from your shell |

## Tests

Tests check **use cases**, not internals. Every test name reads as "someone does X, and Y happens".
They use dummy data only and never touch real services.

- **Unit** (`tests/unit`): period grid maths, search language, draft merge/de-dupe, Google event
  mapping, settings validation, secret encryption.
- **Integration** (`tests/integration/usecases.test.ts`): real SQL through the Neon driver to the fake
  Neon (`tests/fakes/neon.ts`, in-memory PGlite) seeded from `database/seed.sql`, with the fake Google Calendar (`tests/fakes/google.ts`) and fake OpenAI
  (`tests/fakes/openai.ts`) on random ports. Covers upload → commit, re-upload without duplicates, adding an activity by hand,
  edits in both directions, Google-wins conflicts, imports and deletions from Google, settings
  changes creating calendars, admin/access keys, and secret storage.
- **E2E** (`tests/e2e`): Chromium against `next dev` on port 3100, and the fakes on ports
  4010/4011/4012 (the fake Neon starts fresh and seeded each run). Covers sign-in, viewing, filtering,
  searching, editing, dragging, uploading and settings.

To make the fake AI return something else, set `fakes.openai.next = () => ({ company, blocks })` in
an integration test. To simulate someone using Google Calendar, use
`fakes.google.editInGoogle / createInGoogle / deleteInGoogle`.

## Settings and secrets

- `settings` holds one row (`key = 'app'`) with the whole `Settings` object. It is validated by
  `parseSettings()` and merged over `DEFAULT_SETTINGS`, so an empty table means factory defaults.
- **Adding a setting:** add the field to `Settings` in `shared/common/model.ts`, then its default and a
  check in `shared/common/settings.ts`, then a control in `frontend/components/SettingsForm.tsx`. Read it
  with `getSettings()` (server) or `useSettings()` (client). Add a unit test for its validation.
- `secrets` holds AES-256-GCM ciphertext. The key is HKDF(`ADMIN_KEY`). Values are cached for 30
  seconds per server instance, because the auth proxy reads `ACCESS_KEY` on every request.

## Database access

The app connects as `trngprgm_app`, a role that can only read and write rows in its four tables. It can't create,
alter or drop tables, or manage roles, so a bug or injected query in the app can't damage the schema. One-time setup:

1. Neon Console → your project → **Roles** → **New role** `trngprgm_app`. Copy its connection string.
2. Put the existing owner connection string in `frontend/.env.local` as `DATABASE_OWNER_URL`, then run the
   migration (Setup step 3). `schema.sql` grants `trngprgm_app` its row rights whenever the role exists.
3. On Vercel, set `DATABASE_URL` to the `trngprgm_app` connection string and redeploy. Locally, set
   `DATABASE_URL` to it too.

The database also refuses impossible activities: end before start, no companies, or over-long text
(`events_times`, `events_companies`, `events_text_sizes`). They are `not valid` constraints, so old rows never
block a migration. The text limits match `validate()` in `backend/programme/events.ts`.

## Security model

- **Sign-in cookies** are `kind.issued.expires.nonce.HMAC`, signed with `ACCESS_KEY` (session) or `ADMIN_KEY`
  (admin unlock). The server checks the signature, the expiry (`SESSION_MAX_AGE`, 3 hours; one hour for admin) and, for sessions, the idle time (`SESSION_IDLE`, 15 minutes). The cookie is `kind.issued.expires.lastSeen.nonce.HMAC`; `proxy.ts` (pages) and `requireUser()` (actions, API) renew `lastSeen` on each request, never the expiry. The session cookie has no `Max-Age`, so the browser drops it when it closes. `TabSession.tsx` also signs out a tab without the `sessionStorage` flag set by the login form, so a closed tab needs a new sign-in (convenience only; the timeouts are the security) and the
  `revokedBefore` time in the `settings` row `auth`. **Sign everyone out** sets that time. Changing a key also voids
  its cookies. Everyone shares one access key, so one person can't be signed out alone.
- **Headers**: `proxy.ts` sets a per-request nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`,
  `frame-ancestors 'none'`). `next.config.ts` adds HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy` and
  `Permissions-Policy`. Inline `style` attributes stay allowed because React needs them.
- **Errors**: only `UserError` messages (`shared/common/errors.ts`) reach the browser. Anything else is logged on the
  server and shown as a generic message. Throw `UserError` for anything the user should read.
- Tests: `tests/integration` (cookies, revocation, constraints, the app role) and `tests/e2e/5-security.e2e.ts`
  (CSP blocks injected script, headers, forged cookies, sign out, sign everyone out).

## Database changes

`database/schema.sql` is the only migration. It is idempotent (`create … if not exists`,
`alter table … add column if not exists`). Add to it, then run the migration as the owner against each
environment **before** deploying code that needs the change. Grant `trngprgm_app` rights on any new table in
the grant block at the end.

## Deploying (Vercel)

1. Import the repo into Vercel and set **Root Directory** to `frontend`. Vercel installs the whole
   Bun workspace, so `backend` and `shared` resolve.
2. Add `DATABASE_URL` and `ADMIN_KEY`, plus whichever of `ACCESS_KEY`,
   `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CALENDAR_OWNER` and `OPENAI_API_KEY` you won't set on the
   Settings page. The Vercel Neon integration can set `DATABASE_URL`.
3. Run the migration against the production database (step 3 of Setup), and set up the app role
   ([Database access](#database-access)).
4. Deploy.

**Upgrading an existing deployment** to this layout: change Root Directory to `frontend`, add
`ADMIN_KEY`, run the migration (it adds the `settings` and `secrets` tables). The old
`OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` variables are no longer read; set the model and effort
on the Settings page.

## Limits and known shortcuts

Search the code for `ponytail:` comments. Each one marks a deliberate shortcut and says when to
upgrade it. The main ones:

- Vercel caps a request body at 4.5 MB. Images are downscaled in the browser, but large PDFs may need splitting.
- The programme page loads everything from the lookback window (90 days by default) onward.
- Times are Singapore time. There is no timezone setting.
- A failed push to Google during an upload leaves the activity app-only, and the next edit of it pushes it again.
- Renaming a company starts a new calendar. Old events are not moved.
