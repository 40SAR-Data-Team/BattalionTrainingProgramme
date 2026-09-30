# Architecture

Next.js (App Router) on Vercel, Neon Postgres, Google Calendar as the live source of truth.

## Ownership

| Concern | Owner |
|---|---|
| Period grid (P0…ON, REMARKS) ⇄ times | `lib/periods.ts` |
| DB client (server only) | `lib/db.ts` + `schema.sql` |
| `Event` type, company/category lists (safe for client code) | `lib/model.ts` |
| Google Calendar REST (token, calendars, event mapping, push, pull) | `lib/google.ts` |
| OpenAI extraction prompt, merge and de-dupe of extracted blocks | `lib/extract.ts` |
| Search query language | `lib/search.ts` |
| All mutations + sync (server actions) | `app/actions.ts` |
| Image/PDF → draft (route handler, needs large bodies) | `app/api/extract/route.ts` |
| Auth: Google sign-in + `ALLOWED_EMAILS` | `auth.ts`, `proxy.ts` |

## Rules

- **Google wins.** App writes send `If-Match: etag`; a 412 triggers `sync()` and the UI shows
  the Google version. `sync()` (incremental `syncToken` pull) runs on every page load.
- One `events` row may belong to many companies; each company has its own Google copy, tracked in
  `events.google` as `{Company: {id, etag}}` and tagged `extendedProperties.private.trngEventId`.
- The LLM reports only period spans; times are computed in `lib/periods.ts`.
- The owner Google account's refresh token lives in the `GOOGLE_REFRESH_TOKEN` env var; clerks never
  hold Calendar credentials.
- New event attributes go in `events.attrs` (jsonb) until they need their own column.
- `legacy/apps-script/` is the retired Sheets pipeline, kept for reference only.
