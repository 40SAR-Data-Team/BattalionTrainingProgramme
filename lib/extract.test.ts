import { expect, test } from "bun:test";
import { merge, toDrafts, withoutExisting, type Block } from "./extract";

const block = (b: Partial<Block>): Block => ({
  date: "2026-09-15", start: "1", end: "2", title: "ORIENTATION RUN", cond: "A COMD", loc: "KHC", resrc: null,
  category: "Physical Training", comments: null, ...b,
});

test("period spans become times; REMARKS become all-day", () => {
  const [run, remark] = toDrafts({ company: "Archer", blocks: [block({}), block({ start: "REMARKS", end: "REMARKS", title: "ARMSKOTE REGISTRATION" })] });
  expect(run).toMatchObject({ start_at: "2026-09-15T07:00:00+08:00", end_at: "2026-09-15T08:50:00+08:00", all_day: false, companies: ["Archer"] });
  expect(remark).toMatchObject({ all_day: true, start_at: "2026-09-15T00:00:00+08:00", title: "ARMSKOTE REGISTRATION" });
});

test("same occurrence across companies merges (case/space-insensitive)", () => {
  const drafts = [
    ...toDrafts({ company: "Archer", blocks: [block({}), block({ title: "IPPT", start: "3", end: "3" })] }),
    ...toDrafts({ company: "Braves", blocks: [block({ title: "orientation  run" })] }),
  ];
  const merged = merge(drafts);
  expect(merged).toHaveLength(2);
  expect(merged[0].companies).toEqual(["Archer", "Braves"]);
});

test("different location stays separate", () => {
  const drafts = [...toDrafts({ company: "Archer", blocks: [block({})] }), ...toDrafts({ company: "Braves", blocks: [block({ loc: "STADIUM" })] })];
  expect(merge(drafts)).toHaveLength(2);
});

test("re-upload drops companies that already have the event", () => {
  const existing = merge(toDrafts({ company: "Archer", blocks: [block({})] }));
  const again = merge([...toDrafts({ company: "Archer", blocks: [block({})] }), ...toDrafts({ company: "Braves", blocks: [block({})] })]);
  const left = withoutExisting(again, existing);
  expect(left).toHaveLength(1);
  expect(left[0].companies).toEqual(["Braves"]);
  expect(withoutExisting(existing, existing)).toHaveLength(0);
});
