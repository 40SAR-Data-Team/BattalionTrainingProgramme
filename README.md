# TrngPrgm

Web app for 40SAR company training programmes. A clerk uploads photos or a PDF of the programme.
The app reads them into a timetable that matches the source grid, and the clerk reviews it and
commits it to Google Calendar. After that, the timetable and Google Calendar stay in two-way sync.

## User Guide

- **Sign in.** Enter the access key on the login page. It keeps you signed in for 30 days.
- **Timetable.** Days are rows and the fixed training periods (0–10, Night Trg 1–3, Overnight) are
  columns, with Remarks on the right. Tabs filter by company: **All, Archer, Braves, Cougar,
  Stallion, Hercules**. Colours follow the programme legend: Outfield, External Training, Physical
  Training, Live Firing/HRA, Off.
- **Edit.** Drag a block to another day or period; it keeps its length. Click a block to change its
  location, comments, conducting, resources, companies, category or periods. Every change goes
  straight to Google Calendar.
- **Live sync.** Each time you open the page or press **Refresh**, the app pulls the latest
  changes from Google Calendar. If a block was changed in Google Calendar at the same time as in
  the app, Google Calendar wins and the app shows you the latest version.
- **Upcoming.** A table of the next 60 days of events.
- **Search** (bar at the bottom) filters both views:
  - Terms written side by side must all match: `live firing` finds events containing both words.
  - `OR`, `AND` and `NOT` (upper case) and parentheses combine terms. Example:
    `cat:"live firing" OR (range AND NOT co:braves)`.
  - Field prefixes search one field: `cat:` category, `loc:` location, `cond:` conducting,
    `resrc:` resources, `co:` company, `title:` title. Terms without a prefix search the title,
    category and comments.
- **Upload.** Choose one or more photos or a PDF. The company is detected from the heading, or you
  can pick it. Review the draft, and fix anything marked **UNCERTAIN** (orange outline). Then press
  **Commit**. Events are appended to each company's calendar, `40SAR <Company> Training Program`;
  a calendar that doesn't exist yet is created. Re-uploading a week does not create duplicates.
  When the same activity happens at the same time and place for several companies, it becomes one
  block tagged with all of them.

**Disclaimer:** events are read from a photographed or scanned document by an AI model. Times,
names and locations can occasionally be misread. Check anything odd against the original.

## Developer Guide

Next.js 16 (App Router) on Vercel, Neon Postgres, Google Calendar REST, and the OpenAI Responses
API. Use `bun` for everything. Read [docs/architecture_patterns.md](docs/architecture_patterns.md)
before making changes.

### Setup

1. **Neon:** create a database, then run `schema.sql` in the Neon SQL editor.
2. **Google Cloud:** enable the Google Calendar API, create a **service account**, and download a
   JSON key for it. No OAuth client or consent screen is needed.
3. **Environment:** copy `.env.example` to `.env.local` and fill it in. Paste the whole JSON key
   on one line as `GOOGLE_SERVICE_ACCOUNT_KEY`. `ACCESS_KEY` is the shared key clerks type on the
   login page. Changing it signs everyone out.
4. **Run:** `bun install`, then `bun run dev`. Tests: `bun run test`. On first sync the service
   account creates the five company calendars and shares them with `GOOGLE_CALENDAR_OWNER` as
   owner. They then appear in that account's Google Calendar.

### Deploy (Vercel)

Import the repo into Vercel. Add every variable from `.env.example` to the project's Environment
Variables; the Vercel Neon integration can set `DATABASE_URL` for you. Then deploy.
`/api/extract` sets `maxDuration = 300` because vision extraction of a dense grid can take a
minute or more.

### Limits

- Vercel caps a request body at 4.5 MB. Photos are downscaled in the browser; large PDFs may need
  splitting.
- The page loads events from 90 days back onward.

### Legacy

`legacy/apps-script/` holds the retired Google Sheets + Apps Script pipeline, kept for reference only.
