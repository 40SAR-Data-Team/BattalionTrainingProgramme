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

/** The programme may have changed, so refresh the daily CET messages afterwards. */
const cet = { after: syncCet };

/** Pulls one company's Google Calendar changes into the app; the client calls it per company to show progress. */
export async function syncCompany(company: string): Promise<Result> {
  return act(requireUser, async () => {
    // pull() creates a calendar for an unseen name, so only configured companies get through.
    if (!isCompany(await getSettings(), company)) throw new UserError("Unknown company");
    await pull(company);
  }, cet);
}

/** Saves an edited event and writes it through to Google; on a Google-side conflict, Google wins. */
export async function saveEvent(e: Event): Promise<Result> {
  return act(requireUser, () => events.saveEvent(e), cet);
}

/** Adds a new activity entered by hand and appends it to each company calendar. */
export async function createEvent(e: Event): Promise<Result> {
  return act(requireUser, () => events.createEvent(e), cet);
}

/** Saves reviewed upload drafts and appends them to each company calendar. */
export async function commitDraft(drafts: Event[]): Promise<Result> {
  return act(requireUser, async () => {
    const { created, skipped } = await events.commitDrafts(drafts);
    return `Added ${created} events${skipped ? `, skipped ${skipped} already on the calendar` : ""}`;
  }, cet);
}

/** Deletes an event from the app and from every company calendar. */
export async function deleteEvent(id: string): Promise<Result> {
  return act(requireUser, () => events.deleteEvent(id), cet);
}
