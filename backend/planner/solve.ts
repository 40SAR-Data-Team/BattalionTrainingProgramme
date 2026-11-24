import { CpModel, CpSat, Domain, setCloudNoticeEnabled, weightedSum, type BoolVar, type IntervalVar, type IntVar } from "cp-sat-wasm";
import { UserError } from "@trng/shared/common/errors";
import type { Period } from "@trng/shared/common/model";
import { addDays } from "@trng/shared/common/periods";
import { check } from "@trng/shared/planner/check";
import { describe, effectiveRules, heldPools, keyOf, poolGroups, spanOf, type Rule, type Training } from "@trng/shared/planner/rules";

/**
 * Places a plan's trainings with Google OR-Tools CP-SAT (WASM), ported from BattalionSAT's model.py / solve.py.
 * Slots are `day * periods + period`, so a block never straddles midnight and a whole day is one interval.
 * Every rule gets its own literal, so an impossible plan names the exact rules that clash.
 * Solving stays on this server: the cloud executor is never selected.
 */

setCloudNoticeEnabled(false);

type Periods = readonly Period[];

/** What Optimise did. `plan` is the whole plan with new placements; `conflicts` is set only when impossible. */
export type SolveResult = { plan: Training[]; message: string; conflicts: string[]; unmet: string[]; problems: string[] };

/** Window and limits for one Optimise run. */
export type SolveOptions = { from: string; to: string; weekends: boolean; timeLimit?: number };

const MAX_WINDOW_DAYS = 366;
const BLAME_TRIAL_SECONDS = 3;
const BLAME_BUDGET_MS = 20_000;
const BLAME_MAX_CANDIDATES = 40;

const dayCount = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

/** Period indexes the solver may use: P1-P10. ponytail: reveille, nights and overnight only by dragging; make it a setting if units plan nights. */
const usablePeriods = (periods: Periods) => periods.map((p, i) => i).filter((i) => i > 0 && /^\d+$/.test(periods[i].key));

/** Start periods where a block of `span` fits inside the usable periods. */
function starts(periods: Periods, t: Training): number[] {
  if (t.wholeDay) return [0];
  const usable = new Set(usablePeriods(periods)), span = spanOf(periods, t);
  return usablePeriods(periods).filter((s) => Array.from({ length: span }, (_, k) => s + k).every((q) => usable.has(q)));
}

/** A rule tied to the literal that switches it on, with the sentence that names it in a report. */
type Lit = { lit: BoolVar; weight: number; text: string };

/** Optimises the plan inside [from, to].
 *
 * Unplaced trainings, and placed ones inside the window that are not locked, get (re)placed in the window.
 * Everything else stays where it is and still blocks its company and pools.
 *
 * Args:
 *   periods: The period grid (Settings).
 *   plan: Every training in the plan.
 *   options: Window (inclusive "YYYY-MM-DD" dates), whether weekends are usable, and a time limit in seconds.
 *
 * Returns:
 *   The updated plan and what happened, with any clashing rules, unmet preferences and check problems.
 *
 * Raises:
 *   UserError: The window is invalid or a training cannot fit in any day.
 */
export async function optimise(periods: Periods, plan: Training[], { from, to, weekends, timeLimit = 30 }: SolveOptions): Promise<SolveResult> {
  if (!(from <= to)) throw new UserError("The window's end must be on or after its start");
  if (dayCount(from, to) >= MAX_WINDOW_DAYS) throw new UserError(`Pick a window of at most ${MAX_WINDOW_DAYS} days`);
  const offsets = Array.from({ length: dayCount(from, to) + 1 }, (_, d) => d).filter((d) => weekends || !isWeekend(addDays(from, d)));
  if (!offsets.length) throw new UserError("The window has no training days. Include weekends or widen it.");

  const inWindow = (t: Training) => t.day !== null && t.day >= from && t.day <= to;
  const active = plan.filter((t) => t.day === null || t.period === null || (inWindow(t) && t.pin !== "fixed"));
  if (!active.length) return { plan, message: "Nothing to place in this window: every training there is locked.", conflicts: [], unmet: [], problems: [] };
  const held = plan.filter((t) => !active.includes(t) && inWindow(t));

  const P = periods.length;
  const m = new CpModel();
  const day = new Map<string, IntVar>(), period = new Map<string, IntVar>(), choice = new Map<string, Map<string, BoolVar>>();
  const byCompany = new Map<string, IntervalVar[]>(), byPool = new Map<string, IntervalVar[]>();
  const push = (map: Map<string, IntervalVar[]>, key: string, iv: IntervalVar) => map.set(key, [...(map.get(key) ?? []), iv]);

  for (const t of active) {
    const k = keyOf(t), span = spanOf(periods, t), ok = starts(periods, t);
    if (!ok.length) throw new UserError(`${t.name} (${t.company}) needs ${span} periods in a row, but a day only offers P1-P10`);
    const d = m.newIntVarFromDomain(Domain.fromValues(offsets), `day[${k}]`);
    const p = m.newIntVarFromDomain(Domain.fromValues(ok), `per[${k}]`);
    const slot = m.newIntVar(0, (offsets.at(-1)! + 1) * P - 1, `slot[${k}]`);
    m.add(slot.eq(d.times(P).plus(p)));
    day.set(k, d); period.set(k, p);
    const iv = m.newFixedSizeIntervalVar(slot, span, `iv[${k}]`);
    push(byCompany, t.company, iv);
    for (const group of poolGroups(t)) {
      if (group.length === 1) { push(byPool, group[0], iv); continue; }
      // "A/B": one optional interval per option, exactly one present (flexible job shop).
      const lits = group.map((pool) => {
        const lit = m.newBoolVar(`use[${k}][${pool}]`);
        push(byPool, pool, m.newOptionalFixedSizeIntervalVar(slot, span, lit, `oiv[${k}][${pool}]`));
        choice.set(k, (choice.get(k) ?? new Map()).set(pool, lit));
        return lit;
      });
      m.addExactlyOne(lits);
    }
  }
  for (const t of held) {
    const iv = m.newFixedSizeIntervalVar(dayCount(from, t.day!) * P + t.period!, spanOf(periods, t), `held[${keyOf(t)}]`);
    push(byCompany, t.company, iv);
    for (const pool of heldPools(t)) push(byPool, pool, iv);
  }
  for (const list of [...byCompany.values(), ...byPool.values()]) if (list.length > 1) m.addNoOverlap(list);

  const byKey = new Map(plan.map((t) => [keyOf(t), t]));
  /** Day of another training: a variable if it is being placed, a constant offset if it is already placed. */
  const dayOf = (k: string): IntVar | number | null => day.get(k) ?? (byKey.get(k)?.day ? dayCount(from, byKey.get(k)!.day!) : null);
  const hard: Lit[] = [], soft: Lit[] = [];

  for (const t of active) {
    const k = keyOf(t), d = day.get(k)!, p = period.get(k)!;
    for (const r of effectiveRules(periods, t)) {
      const lit = m.newBoolVar(`rule[${r.owner}#${r.index + 1}|${k}]`);
      if (!apply(m, r, t, d, p, lit, (date) => dayCount(from, date), dayOf)) continue;
      (r.hard ? hard : soft).push({ lit, weight: r.weight, text: `${t.name} (${t.company}) ${describe(periods, r)}` });
    }
  }
  if (soft.length) m.minimize(weightedSum(soft.map((s) => s.lit.not()), soft.map((s) => s.weight)));
  m.addAssumptions(hard.map((h) => h.lit));

  const result = await CpSat.solve(m, { executor: "worker", maxTimeInSeconds: timeLimit });
  const status = result.statusName();
  if (status === "INFEASIBLE") {
    const conflicts = await blame(m, hard, result.sufficientAssumptionsForInfeasibility());
    return { plan, conflicts, unmet: [], problems: [], message: conflicts.length
      ? "No plan can meet all the rules. These clash, and at least one has to give:"
      : "These rules cannot all be met, but the solver could not narrow down which. Try removing recent rules one at a time." };
  }
  if (status !== "OPTIMAL" && status !== "FEASIBLE")
    return { plan, conflicts: [], unmet: [], problems: [], message: "The solver ran out of time before finding a plan. Try a shorter window or fewer rules." };

  const placed = new Map(active.map((t) => {
    const k = keyOf(t);
    const chosen = [...(choice.get(k) ?? [])].filter(([, lit]) => result.booleanValue(lit)).map(([pool]) => pool);
    const singles = poolGroups(t).filter((g) => g.length === 1).map((g) => g[0]);
    return [k, { ...t, day: addDays(from, Number(result.value(day.get(k)!))), period: Number(result.value(period.get(k)!)), booked: [...singles, ...chosen] }];
  }));
  const next = plan.map((t) => placed.get(keyOf(t)) ?? t);
  const unmet = soft.filter((s) => !result.booleanValue(s.lit)).map((s) => s.text);
  return { plan: next, conflicts: [], unmet, problems: check(periods, next), message: `Placed ${active.length} trainings${unmet.length ? `; ${unmet.length} preferences could not be met` : ""}.` };
}

/** Adds one rule's constraints, enforced only when `lit` is true. Returns false if the rule does not apply (no peer). */
function apply(m: CpModel, r: Rule, t: Training, d: IntVar, p: IntVar, lit: BoolVar, off: (date: string) => number, dayOf: (k: string) => IntVar | number | null): boolean {
  switch (r.kind) {
    case "fixed": m.add(d.eq(off(r.date!))).onlyEnforceIf(lit); m.add(p.eq(r.period!)).onlyEnforceIf(lit); return true;
    case "between": m.add(d.ge(off(r.date!))).onlyEnforceIf(lit); m.add(d.le(off(r.end!))).onlyEnforceIf(lit); return true;
    case "by": m.add(d.le(off(r.date!))).onlyEnforceIf(lit); return true;
    case "not_before": m.add(d.ge(off(r.date!))).onlyEnforceIf(lit); return true;
    case "periods": if (t.wholeDay) return false; m.addLinearExpressionInDomain(p, Domain.fromValues(r.periods!)).onlyEnforceIf(lit); return true;
    case "after":
    case "before": {
      // "after ATP" means this company's ATP; a company that doesn't run it has nothing to follow.
      const other = dayOf(keyOf({ id: r.ref!, company: t.company }));
      if (other === null || r.ref === t.id) return false;
      m.add(r.kind === "after" ? d.ge(typeof other === "number" ? other + r.gap! : other.plus(r.gap!)) : d.plus(r.gap!).le(other)).onlyEnforceIf(lit);
      return true;
    }
  }
}

/** Shrinks CP-SAT's sufficient conflict set to rules that are really needed: each is dropped in turn and kept only if
 * the rest becomes solvable without it. Naming an innocent rule is worse than naming one too few. */
async function blame(m: CpModel, hard: Lit[], indices: number[]): Promise<string[]> {
  let needed = hard.filter((h) => indices.includes(h.lit.index));
  if (needed.length > 1 && needed.length <= BLAME_MAX_CANDIDATES) {
    const deadline = Date.now() + BLAME_BUDGET_MS;
    for (const candidate of [...needed]) {
      if (needed.length <= 1 || Date.now() > deadline) break; // out of budget: keep the rest (conservative, still correct)
      const trial = needed.filter((h) => h !== candidate);
      m.clearAssumptions();
      m.addAssumptions(trial.map((h) => h.lit));
      if ((await CpSat.solve(m, { executor: "worker", maxTimeInSeconds: BLAME_TRIAL_SECONDS })).statusName() === "INFEASIBLE") needed = trial;
    }
  }
  return needed.map((h) => h.text);
}
