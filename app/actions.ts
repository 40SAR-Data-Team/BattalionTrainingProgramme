"use server";
import { refresh } from "next/cache";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { CATEGORIES, COMPANIES, type Event } from "@/lib/model";
import { merge, withoutExisting } from "@/lib/extract";
import { ConflictError, deleteEverywhere, pull, pushEvent } from "@/lib/google";

export type Result = { ok: true } | { ok: false; message: string };

/** Throws unless the caller is signed in (server actions are public POST endpoints). */
async function requireUser() {
  if (!(await auth())) throw new Error("Not signed in");
}

/** Rejects malformed edits before they reach the DB or Google. */
function validate(e: Event) {
  if (!e.title?.trim()) throw new Error("Title is required");
  if (!e.companies.length || e.companies.some((c) => !(COMPANIES as readonly string[]).includes(c))) throw new Error("Pick at least one valid company");
  if (e.category && !(CATEGORIES as readonly string[]).includes(e.category)) throw new Error("Unknown category");
  if (!(new Date(e.start_at) <= new Date(e.end_at))) throw new Error("End must be after start");
}

/** Saves an edited event and writes it through to Google; on a Google-side conflict, Google wins. */
export async function saveEvent(e: Event): Promise<Result> {
  await requireUser();
  try {
    validate(e);
    const [prev] = (await sql`select * from events where id = ${e.id}`) as Event[];
    if (!prev) return { ok: false, message: "This event no longer exists" };
    await sql`
      update events set title = ${e.title.trim()}, start_at = ${e.start_at}, end_at = ${e.end_at}, all_day = ${e.all_day},
        cond = ${e.cond || null}, loc = ${e.loc || null}, resrc = ${e.resrc || null}, comments = ${e.comments || null},
        category = ${e.category || null}, companies = ${e.companies}, updated_at = now()
      where id = ${e.id}`;
    await pushEvent({ ...e, google: prev.google });
    return { ok: true };
  } catch (err) {
    if (err instanceof ConflictError) {
      for (const c of COMPANIES) await pull(c); // Google's version overwrites the local edit
      return { ok: false, message: `${err.message} — showing the latest version` };
    }
    return { ok: false, message: (err as Error).message };
  } finally {
    refresh();
  }
}

/** Saves reviewed upload drafts (merged, minus events that already exist) and appends them to each company calendar. */
export async function commitDraft(drafts: Event[]): Promise<Result & { created?: number; skipped?: number }> {
  await requireUser();
  try {
    drafts.forEach(validate);
    const merged = merge(drafts);
    if (!merged.length) return { ok: true, created: 0, skipped: 0 };
    const from = new Date(Math.min(...merged.map((e) => +new Date(e.start_at)))).toISOString();
    const to = new Date(Math.max(...merged.map((e) => +new Date(e.end_at)))).toISOString();
    const existing = (await sql`select * from events where start_at >= ${from} and start_at <= ${to}`) as Event[];
    const fresh = withoutExisting(merged, existing);
    const failed: string[] = [];
    for (const e of fresh) {
      await sql`
        insert into events (id, title, start_at, end_at, all_day, cond, loc, resrc, comments, category, companies)
        values (${e.id}, ${e.title.trim()}, ${e.start_at}, ${e.end_at}, ${e.all_day}, ${e.cond || null}, ${e.loc || null},
                ${e.resrc || null}, ${e.comments || null}, ${e.category || null}, ${e.companies})`;
      // ponytail: a failed push leaves the row app-only; the next edit of that event pushes it again.
      try { await pushEvent({ ...e, google: {} }); } catch (err) { failed.push(`${e.title}: ${(err as Error).message}`); }
    }
    if (failed.length) return { ok: false, message: `Saved, but ${failed.length} failed to reach Google Calendar: ${failed[0]}` };
    return { ok: true, created: fresh.length, skipped: merged.length - fresh.length };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  } finally {
    refresh();
  }
}

/** Deletes an event from the app and from every company calendar. */
export async function deleteEvent(id: string): Promise<Result> {
  await requireUser();
  try {
    const [e] = (await sql`select * from events where id = ${id}`) as Event[];
    if (e) await deleteEverywhere(e);
    await sql`delete from events where id = ${id}`;
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  } finally {
    refresh();
  }
}
