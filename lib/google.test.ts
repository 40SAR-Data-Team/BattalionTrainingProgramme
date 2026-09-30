import { expect, test } from "bun:test";
import type { Event } from "./db";
import { describe as describeEvent, fromGoogle, parseDescription, toGoogle } from "./google";

const base: Event = {
  id: "11111111-1111-1111-1111-111111111111", title: "ORIENTATION RUN", start_at: "2026-09-15T07:00:00+08:00",
  end_at: "2026-09-15T08:50:00+08:00", all_day: false, cond: "A COMD", loc: "KHC", resrc: null,
  comments: "Bring water\n---\nnot a header", category: "Physical Training", companies: ["Archer"], google: {}, attrs: {},
};

test("description round-trips, including '---' inside comments", () => {
  expect(parseDescription(describeEvent(base))).toEqual({ cond: "A COMD", resrc: null, category: "Physical Training", comments: "Bring water\n---\nnot a header" });
});

test("free-text description from Google becomes comments", () => {
  expect(parseDescription("just a note")).toEqual({ cond: null, resrc: null, category: null, comments: "just a note" });
});

test("timed event to Google and back", () => {
  const g = { id: "g1", etag: "e1", ...toGoogle(base, "Archer") };
  expect(g.extendedProperties.private.trngEventId).toBe(base.id);
  expect(g.colorId).toBe("5");
  const back = fromGoogle(g);
  expect(new Date(back.start_at).getTime()).toBe(new Date(base.start_at).getTime());
  expect(back).toMatchObject({ title: "ORIENTATION RUN", loc: "KHC", cond: "A COMD", all_day: false });
});

test("all-day event uses Google's exclusive end date", () => {
  const e = { ...base, all_day: true, start_at: "2026-09-15T00:00:00+08:00", end_at: "2026-09-16T00:00:00+08:00" };
  const g = toGoogle(e, "Archer");
  expect(g.start).toEqual({ date: "2026-09-15" });
  expect(g.end).toEqual({ date: "2026-09-17" });
  expect(fromGoogle({ id: "g", etag: "e", ...g })).toMatchObject({ start_at: e.start_at, end_at: e.end_at, all_day: true });
});
