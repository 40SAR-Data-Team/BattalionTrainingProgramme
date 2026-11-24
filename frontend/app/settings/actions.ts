"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { publicMessage, UserError } from "@trng/shared/common/errors";
import type { Settings } from "@trng/shared/common/model";
import { setSecret, type SecretName } from "@trng/backend/common/secrets";
import { saveSettings as store } from "@trng/backend/common/settings";
import { ADMIN_COOKIE, ADMIN_MAX_AGE, checkAdminKey, cookieOpts, issue, requireAdmin, requireUser, revokeAll } from "@trng/backend/common/session";
import { act, type Result } from "../act";

/** Unlocks settings editing for an hour when the admin key is right. */
export async function unlockSettings(key: string): Promise<Result> {
  return act(requireUser, async () => {
    if (!checkAdminKey(key)) throw new UserError("That admin key is not right");
    (await cookies()).set(ADMIN_COOKIE, (await issue("admin", ADMIN_MAX_AGE))!, cookieOpts("strict", ADMIN_MAX_AGE));
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
