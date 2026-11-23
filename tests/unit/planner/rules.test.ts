import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "@trng/shared/common/settings";
import { check } from "@trng/shared/planner/check";
import { formatRule, fromCsv, parseRules, toCsv, type Training } from "@trng/shared/planner/rules";

const { periods, companies } = DEFAULT_SETTINGS;
const t = (over: Partial<Training>): Training => ({
  id: "X", name: "X", company: "Archer", duration: 1, wholeDay: false, instructor: "", location: "", resources: "",
  rules: "", day: null, period: null, pin: "", tags: "", ...over,
});

test("every rule kind round-trips through BattalionSAT's syntax", () => {
  const cell = "fixed:2026-08-03:P1;between:2026-08-01..2026-08-09;by:2026-08-31;not_before:2026-08-01;after:ATP+1d;before:FTX;?periods:P1-P4,P8,N1@25";
  expect(parseRules(periods, cell, "VOC2").map((r) => formatRule(periods, r)).join(";")).toBe(cell);
});

test("bad rules say which rule and why", () => {
  expect(() => parseRules(periods, "by:2026-08-31;after:", "VOC2")).toThrow("VOC2 rule 2: 'after' needs a training id");
  expect(() => parseRules(periods, "periods:P4-P1", "PT")).toThrow("runs backwards");
  expect(() => parseRules(periods, "soon:tomorrow", "PT")).toThrow("unknown rule type 'soon'");
});

test("CSV round-trips, writing companies as BattalionSAT's letters and reading them back", () => {
  const plan = [
    t({ id: "IPPT", name: "IPPT, station test", duration: 2, location: "STADIUM", rules: "by:2026-08-31", day: "2026-08-03", period: 1, pin: "soft" }),
    t({ id: "FTX", company: "Braves", wholeDay: true, duration: 0, resources: "RANGE_1/RANGE_2,MEDIC", rules: "after:IPPT+5d", tags: "outfield" }),
  ];
  const csv = toCsv(periods, companies, plan);
  expect(csv.split("\r\n")[1]).toBe('IPPT,"IPPT, station test",A,2,FALSE,,STADIUM,,by:2026-08-31,2026-08-03,P1,soft,');
  expect(fromCsv(periods, companies, csv)).toEqual(plan);
});

test("a CSV row with a bad company or duration names the row", () => {
  expect(() => fromCsv(periods, companies, "training_id,company,duration_periods\nPT,Z,1\n")).toThrow("row 2: unknown company 'Z'");
  expect(() => fromCsv(periods, companies, "training_id,company,duration_periods\nPT,A,0\n")).toThrow("row 2 (PT): duration");
});

test("check finds double-booked pools and broken hard rules, and passes a sound plan", () => {
  const ok = [t({ id: "A1", location: "RANGE", day: "2026-08-03", period: 1 }), t({ id: "B1", company: "Braves", location: "RANGE", day: "2026-08-03", period: 2 })];
  expect(check(periods, ok)).toEqual([]);
  const clash = [ok[0], { ...ok[1], period: 1 }];
  expect(check(periods, clash)).toEqual(["RANGE is double-booked on 2026-08-03: X (Archer) and X (Braves)"]);
  expect(check(periods, [t({ rules: "by:2026-08-01", day: "2026-08-03", period: 1 })])[0]).toContain("must happen by 01 Aug 2026");
});
