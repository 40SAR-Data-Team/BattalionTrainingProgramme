import { UserError } from "../common/errors";
import type { Company, Period } from "../common/model";

/**
 * The Training Planner's data: trainings, their timing rules, and BattalionSAT's CSV format.
 * Ported from BattalionSAT (`solver/domain.py`, `rules.py`, `store.py`) so a plan moves between the two apps unchanged.
 *
 * Rule syntax (one cell, `;`-separated):  `['?'] kind ':' body ['@' weight]`
 *   fixed:2026-08-03:P1 · between:2026-08-01..2026-08-09 · by:2026-08-31 · not_before:2026-08-01
 *   after:ATP+1d · before:FTX+5d · periods:P1-P4,P8
 * A leading `?` makes it a preference; `@N` is its weight (default 10).
 */

type Periods = readonly Period[];

/** How firmly a placed training is held: free, preferred where it is (dragged), or locked. */
export type Pin = "" | "soft" | "fixed";

/** One training for one company. Same columns as BattalionSAT's CSV.
 *
 * Attributes:
 *   id: Training code shared by every company's copy, e.g. "IPPT".
 *   duration: Length in periods; ignored when wholeDay.
 *   instructor, location, resources: Pools it books: "/" = any one of, "," = all of.
 *   rules: Rule cell in the syntax above.
 *   day, period: Where it sits on the grid ("YYYY-MM-DD" and period index), or null if unplaced.
 *   booked: Pool keys the solver chose ("loc:RANGE_1"), so the check knows which alternative was used.
 */
export type Training = {
  id: string; name: string; company: string; duration: number; wholeDay: boolean;
  instructor: string; location: string; resources: string; rules: string;
  day: string | null; period: number | null; pin: Pin; tags: string; booked?: string[];
};

/** One parsed timing rule. `index` and `owner` give it a stable handle ("VOC2#2") for conflict reports. */
export type Rule = {
  kind: "fixed" | "between" | "by" | "not_before" | "after" | "before" | "periods";
  hard: boolean; weight: number; owner: string; index: number;
  date?: string; end?: string; ref?: string; gap?: number; period?: number; periods?: number[];
};

export const RULE_KINDS = ["fixed", "between", "by", "not_before", "after", "before", "periods"] as const;
export const DEFAULT_SOFT_WEIGHT = 10;
/** Weight of the preference a dragged (soft-pinned) box creates: above a normal preference, so it moves last. */
export const PIN_WEIGHT = 100;

/** Unique key of a training copy, e.g. "IPPT@Archer". */
export const keyOf = (t: Pick<Training, "id" | "company">) => `${t.id}@${t.company}`;

/** Printed label of a period: "P3" for numbered periods (as BattalionSAT writes them), else its key ("N1", "ON"). */
export const periodLabel = (periods: Periods, i: number) => (/^\d+$/.test(periods[i].key) ? `P${periods[i].key}` : periods[i].key);

/** Index of a period written as "P3", "3", "n1" or "ON"; throws a UserError naming `what`. */
function parsePeriod(periods: Periods, text: string, what: string): number {
  const key = text.trim().toUpperCase().replace(/^P(?=\d)/, "");
  const i = periods.findIndex((p) => p.key.toUpperCase() === key);
  if (i < 0) throw new UserError(`${what}: '${text.trim()}' is not a period (use ${periods.map((_, j) => periodLabel(periods, j)).join(", ")})`);
  return i;
}

/** "1-4" or "P1,P3" or "N1-N2" into sorted unique period indexes. */
export function parsePeriods(periods: Periods, text: string, what = "periods"): number[] {
  if (!text.trim()) throw new UserError(`${what}: needs at least one period`);
  const out = new Set<number>();
  for (const part of text.split(",").map((s) => s.trim())) {
    const [lo, hi] = part.split("-");
    const a = parsePeriod(periods, lo, what), b = hi === undefined ? a : parsePeriod(periods, hi, what);
    if (b < a) throw new UserError(`${what}: '${part}' runs backwards`);
    for (let i = a; i <= b; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** Canonical period list: contiguous runs collapse to ranges ("P1-P4,P8"). */
function formatPeriods(periods: Periods, list: number[]): string {
  const runs: number[][] = [];
  for (const p of list) (runs.length && p === runs.at(-1)!.at(-1)! + 1 ? runs.at(-1)!.push(p) : runs.push([p]));
  return runs.map((r) => (r.length === 1 ? periodLabel(periods, r[0]) : `${periodLabel(periods, r[0])}-${periodLabel(periods, r.at(-1)!)}`)).join(",");
}

/** Checks a "YYYY-MM-DD" date; throws a UserError naming `what`. */
function parseDate(text: string, what: string): string {
  const d = text.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) throw new UserError(`${what}: '${d}' is not a date (use YYYY-MM-DD)`);
  return d;
}

/** Parses one rule; `index` is its position in the cell. */
function parseOne(periods: Periods, text: string, owner: string, index: number): Rule {
  const what = `${owner} rule ${index + 1}`;
  let body = text.trim();
  const hard = !body.startsWith("?");
  if (!hard) body = body.slice(1).trim();
  let weight = 0;
  const w = body.match(/@(\d+)$/);
  if (w) { weight = Number(w[1]); body = body.slice(0, w.index).trim(); }
  weight = hard ? 0 : weight || DEFAULT_SOFT_WEIGHT;

  const sep = body.indexOf(":");
  if (sep < 0) throw new UserError(`${what}: missing ':' after the rule type in '${text.trim()}'`);
  const kind = body.slice(0, sep).trim().toLowerCase() as Rule["kind"];
  const rest = body.slice(sep + 1).trim();
  if (!RULE_KINDS.includes(kind)) throw new UserError(`${what}: unknown rule type '${kind}' (expected one of ${RULE_KINDS.join(", ")})`);
  const rule: Rule = { kind, hard, weight, owner, index };

  switch (kind) {
    case "fixed": {
      const [when, per] = [rest.slice(0, 10), rest.slice(11)];
      if (rest[10] !== ":") throw new UserError(`${what}: 'fixed' needs a date and a period, e.g. fixed:2026-08-03:P1`);
      return { ...rule, date: parseDate(when, what), period: parsePeriod(periods, per, what) };
    }
    case "between": {
      const [lo, hi] = rest.split("..");
      if (hi === undefined) throw new UserError(`${what}: 'between' needs two dates separated by '..', e.g. between:2026-08-01..2026-08-09`);
      const r = { ...rule, date: parseDate(lo, what), end: parseDate(hi, what) };
      if (r.end < r.date) throw new UserError(`${what}: the window starts after it ends (${r.date} .. ${r.end})`);
      return r;
    }
    case "by":
    case "not_before":
      return { ...rule, date: parseDate(rest, what) };
    case "after":
    case "before": {
      const m = rest.match(/^([^+]+?)(?:\+(.*)d)?$/);
      if (!m?.[1].trim()) throw new UserError(`${what}: '${kind}' needs a training id, e.g. ${kind}:ATP+1d`);
      if (m[2] !== undefined && !/^\d+$/.test(m[2])) throw new UserError(`${what}: '${m[2]}' is not a number of days (e.g. ${kind}:${m[1]}+1d)`);
      return { ...rule, ref: m[1].trim(), gap: Number(m[2] ?? 0) };
    }
    case "periods":
      return { ...rule, periods: parsePeriods(periods, rest, what) };
  }
}

/** Parses a whole rules cell into ordered, individually blamable rules. */
export function parseRules(periods: Periods, text: string, owner: string): Rule[] {
  return text.split(";").filter((p) => p.trim()).map((p, i) => parseOne(periods, p, owner, i));
}

/** Writes one rule back in the compact syntax. */
export function formatRule(periods: Periods, r: Rule): string {
  const body = {
    fixed: () => `fixed:${r.date}:${periodLabel(periods, r.period!)}`,
    between: () => `between:${r.date}..${r.end}`,
    by: () => `by:${r.date}`,
    not_before: () => `not_before:${r.date}`,
    after: () => `after:${r.ref}${r.gap ? `+${r.gap}d` : ""}`,
    before: () => `before:${r.ref}${r.gap ? `+${r.gap}d` : ""}`,
    periods: () => `periods:${formatPeriods(periods, r.periods!)}`,
  }[r.kind]();
  return r.hard ? body : `?${body}@${r.weight}`;
}

/** Plain English for someone who has never heard the word "constraint", e.g. "must happen by 31 Aug 2026". */
export function describe(periods: Periods, r: Rule): string {
  const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  const gap = r.gap === 1 ? "at least 1 day " : r.gap ? `at least ${r.gap} days ` : "";
  const text = {
    fixed: () => `must be on ${day(r.date!)} at ${periodLabel(periods, r.period!)}`,
    between: () => `must be between ${day(r.date!)} and ${day(r.end!)}`,
    by: () => `must happen by ${day(r.date!)}`,
    not_before: () => `must not happen before ${day(r.date!)}`,
    after: () => `must be ${gap}after ${r.ref}`,
    before: () => `must be ${gap}before ${r.ref}`,
    periods: () => `must be in ${formatPeriods(periods, r.periods!)}`,
  }[r.kind]();
  return r.hard ? text : text.replace("must not happen", "prefers not to happen").replace("must", "prefers to");
}

/** The authored rules, plus the one implied by a pin: locked = must stay, dragged = prefers to stay. */
export function effectiveRules(periods: Periods, t: Training): Rule[] {
  const rules = parseRules(periods, t.rules, t.id);
  if (!t.pin || t.day === null || t.period === null) return rules;
  const hard = t.pin === "fixed";
  return [...rules, { kind: "fixed", hard, weight: hard ? 0 : PIN_WEIGHT, owner: t.id, index: rules.length, date: t.day, period: t.period }];
}

/** "RANGE_1/RANGE_2,MEDIC" into OR-groups of namespaced pool keys: [["loc:RANGE_1","loc:RANGE_2"],["loc:MEDIC"]]. */
const groups = (ns: string, text: string) =>
  text.split(",").map((g) => g.split("/").map((o) => o.trim()).filter(Boolean).map((o) => `${ns}:${o}`)).filter((g) => g.length);

/** Every OR-group a training books, instructors, locations and resources namespaced so equal names don't contend. */
export const poolGroups = (t: Training) => [...groups("instr", t.instructor), ...groups("loc", t.location), ...groups("res", t.resources)];

/** Pools a placed training holds: the solver's choice if any, else its single-option groups. */
export const heldPools = (t: Training) => t.booked ?? poolGroups(t).filter((g) => g.length === 1).map((g) => g[0]);

/** Periods a training occupies: all of them when whole-day. */
export const spanOf = (periods: Periods, t: Training) => (t.wholeDay ? periods.length : t.duration);

// ---- CSV (BattalionSAT's format) ----------------------------------------------------------------

const HEADER = ["training_id", "name", "company", "duration_periods", "whole_day", "instructor", "location", "resources", "rules", "day", "period", "pin", "tags"];

/** Company column value: its first letter when that is unique (BattalionSAT's A/B/C/S/H), else the full name. */
function companyCode(companies: Company[], name: string): string {
  const letter = name[0]?.toUpperCase();
  return companies.filter((c) => c.name[0]?.toUpperCase() === letter).length === 1 ? letter : name;
}

/** Finds a configured company by full name or unique first letter (case-insensitive). */
function companyFrom(companies: Company[], code: string, where: string): string {
  const c = code.trim().toLowerCase();
  const byName = companies.find((x) => x.name.toLowerCase() === c);
  if (byName) return byName.name;
  const byLetter = c.length === 1 ? companies.filter((x) => x.name[0]?.toLowerCase() === c) : [];
  if (byLetter.length === 1) return byLetter[0].name;
  throw new UserError(`${where}: unknown company '${code}' (use one of ${companies.map((x) => x.name).join(", ")})`);
}

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
export function readCsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { rows.at(-1)!.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      rows.at(-1)!.push(cell); cell = ""; rows.push([]);
    } else cell += ch;
  }
  rows.at(-1)!.push(cell);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

/** Writes a plan as BattalionSAT's CSV. */
export function toCsv(periods: Periods, companies: Company[], plan: Training[]): string {
  const rows = plan.map((t) => [
    t.id, t.name, companyCode(companies, t.company), t.wholeDay ? "" : String(t.duration), t.wholeDay ? "TRUE" : "FALSE",
    t.instructor, t.location, t.resources, t.rules, t.day ?? "", t.period === null ? "" : periodLabel(periods, t.period), t.pin, t.tags,
  ]);
  return [HEADER, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Reads BattalionSAT's CSV into a plan; every error names the row. A `|`-separated company cell becomes one copy each. */
export function fromCsv(periods: Periods, companies: Company[], text: string): Training[] {
  const [head, ...body] = readCsv(text.replace(/^﻿/, ""));
  const col = (name: string) => head?.indexOf(name) ?? -1;
  if (col("training_id") < 0 && col("id") < 0) throw new UserError("This file has no training_id column. Is it a BattalionSAT plan?");
  const out: Training[] = [];
  const seen = new Set<string>();
  body.forEach((r, n) => {
    const get = (name: string) => (r[col(name)] ?? "").trim();
    const where = `row ${n + 2}`;
    const id = get("training_id") || get("id");
    if (!id) throw new UserError(`${where}: the training_id cell is empty`);
    const wholeDay = /^(true|yes|y|1)$/i.test(get("whole_day"));
    const duration = wholeDay ? 0 : Number(get("duration_periods"));
    if (!wholeDay && !(Number.isInteger(duration) && duration >= 1)) throw new UserError(`${where} (${id}): duration must be a whole number of periods, at least 1`);
    const rawDay = get("day"), rawPeriod = get("period");
    if (!rawDay !== !rawPeriod) throw new UserError(`${where} (${id}): a placement needs both a day and a period`);
    const pin = (get("pin").toLowerCase() || (rawDay ? "soft" : "")) as Pin;
    if (!["", "soft", "fixed"].includes(pin)) throw new UserError(`${where} (${id}): pin '${pin}' is not understood (use soft or fixed)`);
    for (const code of get("company").split("|").filter((c) => c.trim())) {
      const t: Training = {
        id, name: get("name") || id, company: companyFrom(companies, code, where), duration, wholeDay,
        instructor: get("instructor"), location: get("location"), resources: get("resources"), rules: get("rules"),
        day: rawDay ? parseDate(rawDay, `${where} (${id})`) : null, period: rawPeriod ? parsePeriod(periods, rawPeriod, `${where} (${id})`) : null,
        pin: rawDay ? pin : "", tags: get("tags"),
      };
      parseRules(periods, t.rules, id); // validate now so the planner sees the row number
      if (seen.has(keyOf(t))) throw new UserError(`${where}: '${id}' appears twice for ${t.company}`);
      seen.add(keyOf(t));
      out.push(t);
    }
  });
  return out;
}
