import { expect, test } from "bun:test";
import { mondayOf, moveTo, onGrid, periodIndex, spanToTimes, timesToSpan } from "./periods";

test("period span <-> times round-trips", () => {
  const t = spanToTimes("2026-09-15", periodIndex("1"), periodIndex("2"));
  expect(t).toEqual({ start_at: "2026-09-15T07:00:00+08:00", end_at: "2026-09-15T08:50:00+08:00" });
  expect(timesToSpan(t.start_at, t.end_at)).toEqual([1, 2]);
  expect(onGrid(t.start_at, t.end_at)).toBe(true);
});

test("night and overnight periods", () => {
  const t = spanToTimes("2026-09-15", periodIndex("N1"), periodIndex("ON"));
  expect(timesToSpan(t.start_at, t.end_at)).toEqual([11, 14]);
});

test("off-grid times snap to overlapping or nearest period", () => {
  expect(timesToSpan("2026-09-15T12:15:00+08:00", "2026-09-15T12:45:00+08:00")).toEqual([6, 6]);
  expect(timesToSpan("2026-09-15T09:30:00+08:00", "2026-09-15T10:30:00+08:00")).toEqual([3, 4]);
  expect(onGrid("2026-09-15T09:30:00+08:00", "2026-09-15T10:30:00+08:00")).toBe(false);
});

test("UTC instants are read in Singapore time", () => {
  expect(timesToSpan("2026-09-14T23:00:00Z", "2026-09-14T23:50:00Z")).toEqual([1, 1]); // 0700 SGT
});

test("mondayOf", () => {
  expect(mondayOf("2026-09-20")).toBe("2026-09-14"); // Sunday
  expect(mondayOf("2026-09-14")).toBe("2026-09-14");
});

test("moveTo keeps the period length and clamps at the last period", () => {
  const e = { start_at: "2026-09-15T07:00:00+08:00", end_at: "2026-09-15T08:50:00+08:00" };
  expect(moveTo(e, "2026-09-16", periodIndex("6"))).toEqual({ start_at: "2026-09-16T13:00:00+08:00", end_at: "2026-09-16T14:50:00+08:00" });
  expect(moveTo(e, "2026-09-16", periodIndex("ON")).end_at).toBe("2026-09-16T22:50:00+08:00");
});
