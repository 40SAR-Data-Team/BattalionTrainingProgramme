"use server";
import { UserError } from "@trng/shared/common/errors";
import { isCompany } from "@trng/shared/common/settings";
import type { Event } from "@trng/shared/common/model";
import { requireUser } from "@trng/backend/common/session";
import { getSettings } from "@trng/backend/common/settings";
import * as events from "@trng/backend/programme/events";
import { syncCet } from "@trng/backend/programme/cet";
import { pull } from "@trng/backend/programme/google";
import { act, type Result } from "../act";

/** Pulls one company's Google Calendar changes into the app; the client calls it per company to show progress.
 * CET is refreshed only for this company and only when Google reported a change, so an unchanged sync is one list call.
 * ponytail: a pull that writes through to a sibling company's calendar leaves that sibling's CET until its next change. */
export async function syncCompany(company: string): Promise<Result> {
  let changed = false;
  return act(requireUser, async () => {
    // pull() creates a calendar for an unseen name, so only configured companies get through.
    if (!isCompany(await getSettings(), company)) throw new UserError("Unknown company");
    changed = await pull(company);
  }, { after: async () => { if (changed) await syncCet([company]); } });
}

/** Saves an edited event and writes it through to Google; on a Google-side conflict, Google wins.
 * CET is refreshed for the companies the event was on before or after the edit; after a failure (e.g. a conflict
 * re-sync) which calendars changed is unknown, so it refreshes all of them. */
export async function saveEvent(e: Event): Promise<Result> {
  let touched: string[] | undefined;
  return act(requireUser, async () => { touched = await events.saveEvent(e); }, { after: () => syncCet(touched) });
}

/** Adds a new activity entered by hand and appends it to each company calendar; refreshes only their CET. */
export async function createEvent(e: Event): Promise<Result> {
  return act(requireUser, () => events.createEvent(e), { after: () => syncCet(e.companies) });
}

/** Saves reviewed upload drafts and appends them to each company calendar. */
export async function commitDraft(drafts: Event[]): Promise<Result> {
  return act(requireUser, async () => {
    const { created, skipped } = await events.commitDrafts(drafts);
    return `Added ${created} events${skipped ? `, skipped ${skipped} already on the calendar` : ""}`;
  }, { after: () => syncCet([...new Set(drafts.flatMap((d) => d.companies))]) });
}

/** Deletes an event from the app and from every company calendar; refreshes only those companies' CET. */
export async function deleteEvent(id: string): Promise<Result> {
  let touched: string[] | undefined;
  return act(requireUser, async () => { touched = await events.deleteEvent(id); }, { after: () => syncCet(touched) });
}
