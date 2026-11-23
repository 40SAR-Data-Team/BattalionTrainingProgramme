"use server";
import { publicMessage } from "@trng/shared/common/errors";
import type { Training } from "@trng/shared/planner/rules";
import { requireUser } from "@trng/backend/common/session";
import { getSettings } from "@trng/backend/common/settings";
import { workbook } from "@trng/backend/planner/excel";
import { optimise, type SolveResult, type SolveOptions } from "@trng/backend/planner/solve";
import { savePlan } from "@trng/backend/planner/store";
import { act, type Result } from "../act";

/** Stores the whole plan after an edit in the browser. */
export async function savePlanAction(plan: Training[]): Promise<Result> {
  return act(requireUser, async () => { await savePlan(await getSettings(), plan); });
}

/** Saves the plan, optimises it inside the window, and saves the result (unless the rules clash). */
export async function optimisePlan(plan: Training[], window: SolveOptions): Promise<{ ok: true; result: SolveResult } | { ok: false; message: string }> {
  try {
    await requireUser();
    const s = await getSettings();
    const result = await optimise(s.periods, await savePlan(s, plan), { from: window.from, to: window.to, weekends: !!window.weekends });
    if (!result.conflicts.length) result.plan = await savePlan(s, result.plan);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, message: publicMessage(err) };
  }
}

/** One company's printed programme for the window, as base64 .xlsx for the browser to download. */
export async function exportExcel(plan: Training[], company: string, from: string, to: string): Promise<{ ok: true; base64: string } | { ok: false; message: string }> {
  try {
    await requireUser();
    const s = await getSettings();
    return { ok: true, base64: (await workbook(s, await savePlan(s, plan), company, from, to)).toString("base64") };
  } catch (err) {
    return { ok: false, message: publicMessage(err) };
  }
}
