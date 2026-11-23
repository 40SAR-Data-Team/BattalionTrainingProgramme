import type { Event, Settings } from "@trng/shared/common/model";
import { merge, toDrafts, withoutExisting, type Block } from "@trng/shared/programme/drafts";
import { publicMessage, UserError } from "@trng/shared/common/errors";
import { isCompany } from "@trng/shared/common/settings";
import { sql } from "../common/db";
import { toEvent } from "../common/events";
import { ConflictError, deleteEverywhere, pushEvent, syncAll } from "./google";
import { extract } from "./openai";
import { getSettings } from "../common/settings";

/** Rejects malformed edits before they reach the DB or Google. */
function validate(e: Event, s: Settings) {
  if (!e.title?.trim()) throw new UserError("Title is required");
  if (!e.companies.length || e.companies.some((c) => !isCompany(s, c))) throw new UserError("Pick at least one valid company");
  if (e.category && !s.categories.some((c) => c.name === e.category)) throw new UserError("Unknown category");
  if (!(new Date(e.start_at) <= new Date(e.end_at))) throw new UserError("End must be after start");
  // Same limits as the events_text_sizes check in database/schema.sql.
  const long = e.title.length > 500 || [e.cond, e.loc, e.resrc].some((v) => (v?.length ?? 0) > 1000) || (e.comments?.length ?? 0) > 20_000;
  if (long) throw new UserError("Text is too long: title up to 500 characters, COND/LOC/RESRC 1000, comments 20000");
}

/** Saves an edited event and writes it through to Google. On a Google-side conflict Google wins: it re-syncs and throws. */
export async function saveEvent(e: Event): Promise<void> {
  validate(e, await getSettings());
  const [prev] = (await sql`select * from events where id = ${e.id}`) as Event[];
  if (!prev) throw new UserError("This event no longer exists");
  await sql`
    update events set title = ${e.title.trim()}, start_at = ${e.start_at}, end_at = ${e.end_at}, all_day = ${e.all_day},
      cond = ${e.cond || null}, loc = ${e.loc || null}, resrc = ${e.resrc || null}, comments = ${e.comments || null},
      category = ${e.category || null}, companies = ${e.companies}, updated_at = now()
    where id = ${e.id}`;
  try {
    await pushEvent({ ...e, google: prev.google });
  } catch (err) {
    if (!(err instanceof ConflictError)) throw err;
    await syncAll(); // Google's version overwrites the local edit
    throw new UserError(`${err.message} — showing the latest version`);
  }
}

/**
 * Saves reviewed upload drafts (merged, minus occurrences that already exist) and appends them to each company calendar.
 *
 * Returns:
 *   How many events were created and how many were skipped as duplicates.
 *
 * Raises:
 *   Error: If a draft is invalid, or some events were saved but failed to reach Google.
 */
export async function commitDrafts(drafts: Event[]): Promise<{ created: number; skipped: number }> {
  const s = await getSettings();
  drafts.forEach((d) => validate(d, s));
  const merged = merge(drafts);
  if (!merged.length) return { created: 0, skipped: 0 };
  const from = new Date(Math.min(...merged.map((e) => +new Date(e.start_at)))).toISOString();
  const to = new Date(Math.max(...merged.map((e) => +new Date(e.end_at)))).toISOString();
  const existing = (await sql`select * from events where start_at >= ${from} and start_at <= ${to}`).map(toEvent);
  const fresh = withoutExisting(merged, existing);
  const failed: string[] = [];
  for (const e of fresh) {
    await sql`
      insert into events (id, title, start_at, end_at, all_day, cond, loc, resrc, comments, category, companies)
      values (${e.id}, ${e.title.trim()}, ${e.start_at}, ${e.end_at}, ${e.all_day}, ${e.cond || null}, ${e.loc || null},
              ${e.resrc || null}, ${e.comments || null}, ${e.category || null}, ${e.companies})`;
    // ponytail: a failed push leaves the row app-only; the next edit of that event pushes it again.
    try { await pushEvent({ ...e, google: {} }); } catch (err) { failed.push(`${e.title}: ${publicMessage(err)}`); }
  }
  if (failed.length) throw new UserError(`Saved, but ${failed.length} failed to reach Google Calendar: ${failed[0]}`);
  return { created: fresh.length, skipped: merged.length - fresh.length };
}

/**
 * Adds one activity entered by hand and appends it to each of its company calendars.
 *
 * Raises:
 *   Error: If it is invalid, already on the calendar, or failed to reach Google.
 */
export async function createEvent(e: Event): Promise<void> {
  if (!(await commitDrafts([e])).created) throw new UserError("That activity is already on the calendar");
}

/** Deletes an event from the app and from every company calendar. */
export async function deleteEvent(id: string): Promise<void> {
  const [e] = (await sql`select * from events where id = ${id}`) as Event[];
  if (e) await deleteEverywhere(e);
  await sql`delete from events where id = ${id}`;
}

/**
 * Reads one uploaded page (image or PDF data: URL) into unsaved draft events.
 *
 * Args:
 *   file: Upload name and data: URL.
 *   company: Company picked by the clerk; the AI no longer guesses it.
 *
 * Raises:
 *   UserError: If the company isn't a configured one.
 *   Error: If the AI call fails twice.
 */
export async function readUpload(file: { name: string; dataUrl: string }, company: string): Promise<{ drafts: Event[] }> {
  const s = await getSettings();
  if (!isCompany(s, company)) throw new UserError("Pick a company first");
  const titles = (await sql`select distinct title from events order by title limit 500`).map((r) => r.title as string);
  let blocks: Block[];
  try { ({ blocks } = await extract(file, titles, s)); }
  catch { ({ blocks } = await extract(file, titles, s)); } // one retry for transient/malformed output
  return { drafts: toDrafts(s.periods, company, blocks) };
}
