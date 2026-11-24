import { clashes } from "../common/clash";
import type { Period } from "../common/model";
import { spanToTimes } from "../common/periods";
import { describe, effectiveRules, heldPools, keyOf, spanOf, type Rule, type Training } from "./rules";

/**
 * Re-checks a plan from scratch against every hard rule, double-booking and day boundary.
 * Deliberately shares no code with the solver (backend/planner/solve.ts), so a mistake in how a rule is
 * turned into CP-SAT shows up here as a problem instead of as a silently wrong timetable.
 */

type Periods = readonly Period[];
const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/** Why a placed training breaks one hard rule, or null if it doesn't. */
function violated(periods: Periods, r: Rule, t: Training, peer: (id: string) => Training | undefined): string | null {
  const day = t.day!, per = t.period!;
  const other = r.ref ? peer(r.ref) : undefined;
  const broken = {
    fixed: () => day !== r.date || per !== r.period,
    between: () => day < r.date! || day > r.end!,
    by: () => day > r.date!,
    not_before: () => day < r.date!,
    after: () => !!other?.day && days(other.day, day) < r.gap!,
    before: () => !!other?.day && days(day, other.day) < r.gap!,
    periods: () => !t.wholeDay && !r.periods!.includes(per),
  }[r.kind]();
  return broken ? `${t.name} (${t.company}) ${describe(periods, r)} but is on ${day} at period ${per}` : null;
}

/** Problems in a plan's placed trainings; an empty list means it is sound.
 *
 * Args:
 *   periods: The period grid (Settings).
 *   plan: Every training; unplaced ones are skipped.
 *
 * Returns:
 *   One readable sentence per problem.
 */
export function check(periods: Periods, plan: Training[]): string[] {
  const placed = plan.filter((t) => t.day !== null && t.period !== null);
  const byKey = new Map(plan.map((t) => [keyOf(t), t]));
  const problems: string[] = [];

  const blocks = placed.flatMap((t) => {
    const last = t.period! + spanOf(periods, t) - 1;
    if (last >= periods.length) { problems.push(`${t.name} (${t.company}) runs past the end of the day`); return []; }
    return [{ t, all_day: false, ...spanToTimes(periods, t.day!, t.period!, last) }];
  });
  for (const { key, a, b } of clashes(blocks, (x) => [`company:${x.t.company}`, ...heldPools(x.t)]))
    problems.push(`${key.replace(/^\w+:/, "")} is double-booked on ${a.t.day}: ${a.t.name} (${a.t.company}) and ${b.t.name} (${b.t.company})`);

  for (const t of placed)
    for (const r of effectiveRules(periods, t).filter((x) => x.hard)) {
      const why = violated(periods, r, t, (id) => byKey.get(keyOf({ id, company: t.company })));
      if (why) problems.push(why);
    }
  return problems;
}
