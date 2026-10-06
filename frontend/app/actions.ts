"use server";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { publicMessage, UserError } from "@trng/shared/errors";
import type { Event, Settings } from "@trng/shared/model";
import * as events from "@trng/backend/events";
import { setSecret, type SecretName } from "@trng/backend/secrets";
import { saveSettings as store } from "@trng/backend/settings";
import {
  ADMIN_COOKIE, ADMIN_MAX_AGE, checkAdminKey, cookieOpts, issue, requireAdmin, requireUser, revokeAll, SESSION_COOKIE, SignedOutError,
} from "@trng/backend/session";

export type Result = { ok: true; message?: string } | { ok: false; message: string };

/** Runs a server action body after an auth check; turns thrown errors into a Result (only UserError text reaches
 * the browser) and re-renders the page. */
async function act(guard: () => Promise<void>, body: () => Promise<string | void>): Promise<Result> {
  try {
    await guard();
  } catch (err) {
    if (err instanceof SignedOutError) redirect("/login"); // expired or revoked mid-session; nothing to re-render
    return { ok: false, message: publicMessage(err) };
  }
  try {
    return { ok: true, message: (await body()) ?? undefined };
  } catch (err) {
    return { ok: false, message: publicMessage(err) };
  } finally {
    refresh();
  }
}

/** Saves an edited event and writes it through to Google; on a Google-side conflict, Google wins. */
export async function saveEvent(e: Event): Promise<Result> {
  return act(requireUser, () => events.saveEvent(e));
}

/** Adds a new activity entered by hand and appends it to each company calendar. */
export async function createEvent(e: Event): Promise<Result> {
  return act(requireUser, () => events.createEvent(e));
}

/** Saves reviewed upload drafts and appends them to each company calendar. */
export async function commitDraft(drafts: Event[]): Promise<Result> {
  return act(requireUser, async () => {
    const { created, skipped } = await events.commitDrafts(drafts);
    return `Added ${created} events${skipped ? `, skipped ${skipped} already on the calendar` : ""}`;
  });
}

/** Deletes an event from the app and from every company calendar. */
export async function deleteEvent(id: string): Promise<Result> {
  return act(requireUser, () => events.deleteEvent(id));
}

/** Unlocks settings editing for an hour when the admin key is right. */
export async function unlockSettings(key: string): Promise<Result> {
  return act(requireUser, async () => {
    if (!checkAdminKey(key)) throw new UserError("That admin key is not right");
    (await cookies()).set(ADMIN_COOKIE, (await issue("admin", ADMIN_MAX_AGE))!, cookieOpts(ADMIN_MAX_AGE, "strict"));
  });
}

/** Saves settings (admin only). */
export async function saveSettings(s: Settings): Promise<Result> {
  return act(requireAdmin, async () => { await store(s); return "Settings saved"; });
}

/** Sets or clears one secret (admin only). An empty value reverts to the environment variable. */
export async function saveSecret(name: SecretName, value: string): Promise<Result> {
  return act(requireAdmin, async () => {
    if (name === "GOOGLE_SERVICE_ACCOUNT_KEY" && value) {
      try { JSON.parse(value); } catch { throw new UserError("The Google service account key is not valid JSON — paste the whole key file"); }
    }
    await setSecret(name, value.trim());
    return value ? "Saved" : "Cleared — using the environment variable";
  });
}

/** Signs this browser out (session and admin unlock) and goes to the sign-in page. */
export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ADMIN_COOKIE);
  redirect("/login");
}

/** Signs every browser out, this one included (admin only). Use after a key or device may have leaked. */
export async function signOutEveryone(): Promise<Result> {
  try {
    await requireAdmin();
    await revokeAll();
  } catch (err) {
    return { ok: false, message: publicMessage(err) };
  }
  redirect("/login"); // not via act(): re-rendering this page after the revoke would find no valid sign-in
}
