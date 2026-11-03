import { expect, test } from "bun:test";
import { prompt } from "@trng/backend/openai";
import { DEFAULT_SETTINGS } from "@trng/shared/settings";

// Use case: the AI is told the unit's own grid and colours, so an admin's Settings change reaches extraction.

test("the extraction prompt lists every period, colour and known title from settings", () => {
  const text = prompt(DEFAULT_SETTINGS, ["IPPT"], "2026-10-06");
  for (const p of DEFAULT_SETTINGS.periods) expect(text).toContain(`${p.key} = ${p.label}`);
  for (const c of DEFAULT_SETTINGS.categories) expect(text).toContain(`${c.legend} = ${c.name}`);
  expect(text).not.toContain("COMPANY:"); // the clerk picks the company; the AI never guesses it
  expect(text).toContain("  IPPT");
  expect(text).toContain("nearest to today, 2026-10-06");
});
