# TrngPrgm

Turns each company's training programme into events on that company's Google Calendar.

## User Guide

Each company gets its own Google Calendar, named `40SAR <Company> Training Program` (Archer, Braves, Cougar, Stallion, Hercules). Open that calendar to see the schedule.

The underlying Google Sheet has a **Calendar Sync** menu with three options:

- **Initialize Sheets** — creates any missing company tabs with the correct header row. Run once per new company.
- **Resync** — pushes every row on a company's tab to its calendar, creating, updating, or removing events to match the sheet. Run this after a bulk update to the sheet.
- **Install & Verify Triggers** — sets up automatic sync so that edits to a row update the calendar within seconds, and confirms it's working. Run this once, or after Google resets script triggers.

Day-to-day, you don't need to do anything — edit the sheet and the calendar follows. Use Resync only if events look out of date.

**Disclaimer:** Calendar events are generated from the latest available training programme snapshot using LLM-based OCR. Because this involves reading a photographed or scanned document, occasional discrepancies — a misread time, instructor name, or location — can occur. If something on the calendar looks wrong, check it against the original training programme document.

## Developer Guide

The pipeline has four stages:

**1. Training Programme (image)**
Input is a photographed or scanned grid timetable — one per company, days as rows, numbered periods as columns.

**2. LLM-based OCR → CSV**
An LLM reads the image and produces a CSV, following the `ingesting-timetable-images` Claude skill. Key rules:
- Header is exactly: `Id,Event,Instructor,Location,Start Date,Start Time,End Date,End Time,Resources,Comments,Status`
- One row per activity block, not per period.
- Dates are ISO (`YYYY-MM-DD`), times are 24-hour (`HH:MM`).
- Blank cells stay blank — never filled with a placeholder.
- Full-width remarks or banner rows become their own all-day event, not duplicated onto every activity row.

See the skill file for the full format spec and common mistakes to check for.

**3. CSV → Google Sheets**
Manual step: import the CSV into the company's tab in the Sheet (File > Import, replace or append). This is the one stage with no automation — a script here would remove the manual gap.

**4. Sheets → Google Calendar**
An Apps Script (`Code.gs`, `Config.gs`) bound to the Sheet keeps each company's tab in sync with its calendar:

| Column | Purpose |
|---|---|
| Id | Unique row identifier, tags the matching calendar event |
| Event | Event title |
| Instructor | Instructor name |
| Location | Event location |
| Start Date / Start Time | Event start |
| End Date / End Time | Event end |
| Resources | Extra resources listed on the event |
| Comments | Free-text notes |
| Status | Event status |

- `onEdit` trigger upserts or deletes calendar events as rows change, matching rows to events via a `rowId` extended property.
- **Resync** does a full batched push through the Calendar API, with retry on rate limits.
- Each company's calendar must already exist, named `40SAR <Company> Training Program` — the script looks it up by name and fails if it's missing or ambiguous.
- Timezone is `Asia/Singapore`. Requires the Calendar Advanced Service enabled in the Apps Script project.
- `runSelfTest()` in the Apps Script editor creates and deletes a scratch row/event to verify the trigger and sync are working.
- Code is deployed via `clasp push`/`pull` (see `.clasp.json`); only `appsscript.json`, `Code.gs`, and `Config.gs` are pushed (`.claspignore`).

### Repo layout

- `Code.gs` — sync logic (menu, triggers, resync, self-test).
- `Config.gs` — company list, column schema, header labels.
- `appsscript.json` — Apps Script manifest.
- `.clasp.json` / `.claspignore` — `clasp` deploy config.
- `Archer/`, `Braves/`, `Cougar/`, `Hercules/`, `Scorpion/`, `Stallion/` — per-company staging folders for source images/CSVs.

### Adding a company

1. Add the name to `COMPANIES` in `Config.gs`.
2. Create a Google Calendar named `40SAR <Company> Training Program`.
3. Run **Initialize Sheets** from the Calendar Sync menu.
