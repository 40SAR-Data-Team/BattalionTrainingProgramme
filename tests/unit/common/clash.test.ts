import { expect, test } from "bun:test";
import { clashes, normName } from "@trng/shared/common/clash";

const ev = (title: string, loc: string | null, start: string, end: string, all_day = false) =>
  ({ title, loc, all_day, start_at: `2026-11-23T${start}:00+08:00`, end_at: `2026-11-23T${end}:00+08:00` });
const byLoc = (e: { loc: string | null }) => [normName(e.loc)];
const titles = (list: ReturnType<typeof clashes<ReturnType<typeof ev>>>) => list.map((c) => `${c.key}: ${c.a.title} x ${c.b.title}`);

test("overlapping events at the same location clash, matched case- and space-insensitively", () => {
  const out = clashes([ev("IPPT", "Stadium", "13:00", "14:50"), ev("SOCCER", " stadium ", "14:00", "15:00"), ev("RANGE", "Range  3", "13:00", "15:00")], byLoc);
  expect(titles(out)).toEqual(["stadium: IPPT x SOCCER"]);
});

test("touching events, empty locations and all-day remarks do not clash", () => {
  expect(clashes([ev("A", "KHC", "07:00", "07:50"), ev("B", "KHC", "07:50", "08:40")], byLoc)).toEqual([]);
  expect(clashes([ev("A", null, "07:00", "09:00"), ev("B", "", "07:00", "09:00")], byLoc)).toEqual([]);
  expect(clashes([ev("A", "KHC", "00:00", "00:00", true), ev("B", "KHC", "07:00", "09:00")], byLoc)).toEqual([]);
});

test("one long event clashes with each event inside it", () => {
  const out = clashes([ev("CAMP", "TEKONG", "08:00", "17:50"), ev("X", "TEKONG", "09:00", "10:00"), ev("Y", "TEKONG", "13:00", "14:00")], byLoc);
  expect(titles(out)).toEqual(["tekong: CAMP x X", "tekong: CAMP x Y"]);
});
