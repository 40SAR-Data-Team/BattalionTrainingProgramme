import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS } from "@trng/shared/common/settings";
import type { Training } from "@trng/shared/planner/rules";
import { optimise } from "@trng/backend/planner/solve";

const { periods } = DEFAULT_SETTINGS;
const t = (over: Partial<Training>): Training => ({
  id: "X", name: "X", company: "Archer", duration: 1, wholeDay: false, instructor: "", location: "", resources: "",
  rules: "", day: null, period: null, pin: "", tags: "", ...over,
});
const week = { from: "2026-08-03", to: "2026-08-07", weekends: false }; // Mon-Fri

test("places every training in the window, honouring order, pools and alternatives, and the check agrees", async () => {
  const plan = [
    t({ id: "IMT", duration: 3, location: "RANGE_1/RANGE_2" }),
    t({ id: "VOC1", duration: 2, location: "RANGE_1", rules: "after:IMT+1d" }),
    t({ id: "IMT", company: "Braves", duration: 3, location: "RANGE_1/RANGE_2", rules: "periods:P1-P5" }),
  ];
  const r = await optimise(periods, plan, week);
  expect(r.conflicts).toEqual([]);
  expect(r.problems).toEqual([]);
  const [imt, voc1, bimt] = r.plan;
  expect(imt.day! < voc1.day!).toBe(true);
  expect(bimt.period!).toBeLessThanOrEqual(5); // "periods" limits the start period, as in BattalionSAT
  expect([imt, voc1, bimt].every((x) => x.day! >= week.from && x.day! <= week.to)).toBe(true);
});

test("an impossible plan names exactly the clashing rules", async () => {
  const plan = [
    t({ id: "VOC1", rules: "not_before:2026-08-06" }),
    t({ id: "VOC2", rules: "after:VOC1+1d;by:2026-08-06;periods:P1-P10" }),
  ];
  const r = await optimise(periods, plan, week);
  expect(r.conflicts.sort()).toEqual([
    "X (Archer) must be at least 1 day after VOC1",
    "X (Archer) must happen by 06 Aug 2026",
    "X (Archer) must not happen before 06 Aug 2026",
  ]);
});

test("locked trainings stay put and block their pool; placed ones outside the window are left alone", async () => {
  const plan = [
    t({ id: "LOCKED", location: "RANGE", day: "2026-08-03", period: 1, pin: "fixed" }),
    t({ id: "OUTSIDE", day: "2026-09-01", period: 3, pin: "" }),
    t({ id: "NEW", company: "Braves", location: "RANGE", rules: "fixed:2026-08-03:P1" }),
  ];
  const r = await optimise(periods, plan, week);
  expect(r.plan[0]).toEqual(plan[0]);
  expect(r.plan[1]).toEqual(plan[1]);
  expect(r.conflicts).toEqual(["X (Braves) must be on 03 Aug 2026 at P1"]);
});

test("a window with no training days, or ending before it starts, is refused", async () => {
  await expect(optimise(periods, [t({})], { from: "2026-08-08", to: "2026-08-09", weekends: false })).rejects.toThrow("no training days");
  await expect(optimise(periods, [t({})], { from: "2026-08-09", to: "2026-08-08", weekends: false })).rejects.toThrow("end must be on or after");
});
