import { expect, test } from "bun:test";
import type { Event } from "@trng/shared/model";
import { compile } from "@trng/shared/search";

const ev = (title: string, extra: Partial<Event> = {}): Event => ({
  id: title, title, start_at: "", end_at: "", all_day: false, cond: null, loc: null, resrc: null, comments: null,
  category: null, companies: ["Archer"], google: {}, attrs: {}, ...extra,
});
const all = [
  ev("ORIENTATION RUN", { category: "Physical Training", loc: "KHC", cond: "A COMD" }),
  ev("LIVE FIRING RANGE", { category: "Live Firing/HRA", companies: ["Braves"] }),
  ev("UIP LESSONS", { loc: "COYLINE", companies: ["Archer", "Braves"] }),
];
const hits = (q: string) => all.filter(compile(q)).map((e) => e.title);

test("empty query matches everything", () => expect(hits("  ")).toHaveLength(3));
test("bare term, case-insensitive", () => expect(hits("run")).toEqual(["ORIENTATION RUN"]));
test("adjacent terms mean AND", () => expect(hits("uip lessons")).toEqual(["UIP LESSONS"]));
test("OR", () => expect(hits("run OR range")).toEqual(["ORIENTATION RUN", "LIVE FIRING RANGE"]));
test("NOT and field prefix", () => expect(hits("co:braves AND NOT range")).toEqual(["UIP LESSONS"]));
test("quoted phrase in field", () => expect(hits('cat:"live firing"')).toEqual(["LIVE FIRING RANGE"]));
test("AND binds tighter than OR", () => expect(hits("loc:khc OR co:braves AND uip")).toEqual(["ORIENTATION RUN", "UIP LESSONS"]));
test("parentheses", () => expect(hits("(loc:khc OR co:braves) AND NOT uip")).toEqual(["ORIENTATION RUN", "LIVE FIRING RANGE"]));
test("syntax errors", () => {
  expect(() => compile("(run")).toThrow('Missing ")"');
  expect(() => compile("run OR")).toThrow("ends too early");
  expect(() => compile("foo:bar")).toThrow("Unknown field");
  expect(() => compile("run )")).toThrow('Unexpected ")"');
});
