import { UserError } from "@trng/shared/common/errors";
import type { Settings } from "@trng/shared/common/model";
import { isCompany } from "@trng/shared/common/settings";
import { keyOf, parseRules, type Pin, type Training } from "@trng/shared/planner/rules";
import { sql } from "../common/db";

/**
 * The Training Planner's plan: one jsonb row (key `planner`) in the `settings` table, so no schema change.
 * ponytail: one row means one planner at a time (as in BattalionSAT); give it its own table if several plan at once.
 */

const MAX_TRAININGS = 10_000;
const MAX_TEXT = 1000;

/** The saved plan, or an empty one. */
export async function loadPlan(): Promise<Training[]> {
  const [row] = await sql`select value from settings where key = 'planner'`;
  return (row?.value?.trainings as Training[] | undefined) ?? [];
}

/** Rebuilds one training from untrusted input, keeping only known fields; throws a UserError naming it. */
function clean(s: Pick<Settings, "companies" | "periods">, raw: Training): Training {
  const text = (v: unknown, what: string) => {
    const out = typeof v === "string" ? v.trim() : "";
    if (out.length > MAX_TEXT) throw new UserError(`${what} is too long (up to ${MAX_TEXT} characters)`);
    return out;
  };
  const id = text(raw.id, "Training id");
  if (!id || /[;@+]/.test(id)) throw new UserError("Each training needs an id without ; @ or +");
  if (!isCompany(s, raw.company)) throw new UserError(`${id}: pick a valid company`);
  const wholeDay = raw.wholeDay === true;
  const duration = wholeDay ? 0 : Number(raw.duration);
  if (!wholeDay && !(Number.isInteger(duration) && duration >= 1 && duration <= s.periods.length)) throw new UserError(`${id}: duration must be 1 to ${s.periods.length} periods`);
  const placed = typeof raw.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.day) && Number.isInteger(raw.period) && raw.period! >= 0 && raw.period! < s.periods.length;
  const t: Training = {
    id, name: text(raw.name, `${id} name`) || id, company: raw.company, duration, wholeDay,
    instructor: text(raw.instructor, `${id} instructor`), location: text(raw.location, `${id} location`), resources: text(raw.resources, `${id} resources`),
    rules: text(raw.rules, `${id} rules`), tags: text(raw.tags, `${id} tags`),
    day: placed ? raw.day : null, period: placed ? raw.period : null,
    pin: placed && ["soft", "fixed"].includes(raw.pin) ? (raw.pin as Pin) : "",
    ...(placed && Array.isArray(raw.booked) ? { booked: raw.booked.filter((b): b is string => typeof b === "string").slice(0, 50) } : {}),
  };
  parseRules(s.periods, t.rules, id); // throws a readable UserError
  return t;
}

/** Validates and stores the whole plan.
 *
 * Args:
 *   s: Settings, for the valid companies and periods.
 *   plan: The plan as edited in the browser (untrusted).
 *
 * Returns:
 *   The stored plan.
 *
 * Raises:
 *   UserError: A training is malformed or appears twice for one company.
 */
export async function savePlan(s: Pick<Settings, "companies" | "periods">, plan: Training[]): Promise<Training[]> {
  if (!Array.isArray(plan) || plan.length > MAX_TRAININGS) throw new UserError(`A plan holds up to ${MAX_TRAININGS} trainings`);
  const out = plan.map((t) => clean(s, t));
  const keys = new Set(out.map(keyOf));
  if (keys.size !== out.length) throw new UserError("A training appears twice for the same company");
  await sql`insert into settings (key, value) values ('planner', ${JSON.stringify({ trainings: out })}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return out;
}
