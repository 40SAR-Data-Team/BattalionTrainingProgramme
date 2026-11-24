import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { publicMessage } from "@trng/shared/common/errors";
import { SignedOutError } from "@trng/backend/common/session";

export type Result = { ok: true; message?: string } | { ok: false; message: string };

/** Runs a server action body after an auth check, then re-renders the page.
 *
 * Thrown errors become a Result; only UserError text reaches the browser. `after` runs last and never fails the action.
 */
export async function act(guard: () => Promise<void>, body: () => Promise<string | void>, { after }: { after?: () => Promise<unknown> } = {}): Promise<Result> {
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
    if (after) await after().catch((err) => publicMessage(err));
    refresh();
  }
}
