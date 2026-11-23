import { expect, test } from "bun:test";
import { buildCet, keepFilled } from "@trng/shared/programme/cet";
import type { Event } from "@trng/shared/common/model";

const run: Event = {
  id: "1", title: "Metabolic Circuit 7", start_at: "2026-11-05T07:30:00+08:00", end_at: "2026-11-05T08:30:00+08:00",
  all_day: false, cond: "Running Attire", loc: "40SAR Parade Square", resrc: "Full Admin Bottle",
  comments: "Transition from FP", category: null, companies: ["Archer"], google: {}, attrs: {},
};

test("a day's programme becomes a CET with blank roster, blank fixed slots and the activity's details", () => {
  const cet = buildCet("2026-11-05", [run]);
  expect(cet).toStartWith("*Daily CET for Thursday 051126*\n\nCDO:\nCDS:");
  expect(cet).toContain("\nReveille\n\nBreakfast\n\n0730 Metabolic Circuit 7 @ 40SAR Parade Square\n> Attire: Running Attire\n> Items to Bring: Full Admin Bottle\n> Transition from FP\n\nLunch\n");
  expect(cet).toEndWith("Note:\n1.");
});

test("regenerating a CET keeps what commanders filled in", () => {
  const edited = buildCet("2026-11-05", [run]).replace("CDO:", "CDO: 2LT JOEN CHUA").replace("\nReveille", "\n0550 Reveille").replace("*Duty Bunk:*", "*Duty Bunk: P2B4*");
  const next = keepFilled(edited, buildCet("2026-11-05", [{ ...run, title: "Run" }]));
  expect(next).toContain("CDO: 2LT JOEN CHUA");
  expect(next).toContain("\n0550 Reveille\n");
  expect(next).toContain("*Duty Bunk: P2B4*");
  expect(next).toContain("0730 Run @");
  expect(next).toContain("\nCDS:\n");
});
