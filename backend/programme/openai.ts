import type { Settings } from "@trng/shared/common/model";
import type { Block } from "@trng/shared/programme/drafts";
import { sgDate } from "@trng/shared/common/periods";
import { UserError } from "@trng/shared/common/errors";
import { secret } from "../common/secrets";

const nullable = { type: ["string", "null"] };

/** JSON schema for OpenAI structured output, built from the configured categories and periods. */
export function schema(s: Settings) {
  const periodKeys = [...s.periods.map((p) => p.key), "REMARKS"];
  return {
    type: "object", additionalProperties: false, required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["date", "start", "end", "title", "cond", "loc", "resrc", "category", "comments"],
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            start: { type: "string", enum: periodKeys }, end: { type: "string", enum: periodKeys },
            title: { type: "string" }, cond: nullable, loc: nullable, resrc: nullable, comments: nullable,
            category: { type: ["string", "null"], enum: [...s.categories.map((c) => c.name), null] },
          },
        },
      },
    },
  };
}

/**
 * Extraction instructions for one programme sheet, built from the configured grid and legend.
 *
 * Args:
 *   s: Current settings (periods, categories).
 *   existingTitles: Activity titles already in the database, so repeats reuse the same spelling.
 *   today: Today's date (YYYY-MM-DD), used only when the sheet shows no year.
 *
 * Returns:
 *   The prompt text.
 */
export function prompt(s: Settings, existingTitles: string[], today = sgDate(new Date())): string {
  const periods = s.periods.map((p) => `${p.key} = ${p.label} (${p.start}-${p.end})`).join("; ");
  const legend = s.categories.map((c) => `${c.legend} = ${c.name}`).join("; ");
  return `Read this photographed weekly military training programme into calendar items. Ignore watermarks, cursors, spreadsheet
column letters, footers and week numbers.

LAYOUT
- Rows are days Mon-Sun, labelled "Mon 5/10" (day/month). Columns are periods: ${periods}; then REMARKS.
- Columns differ in width and photos are skewed: place each block by matching its borders to the header gridlines, not by text.
  Activities can shift (e.g. "ENFORCED REST" in period 0 pushes REVEILLE to period 1).
- Each day has a title band, then COND, LOC and RESRC sub-rows. A sub-row cell merged across blocks applies to each block above it.

ITEMS (one per block, not per period)
- start/end: keys of the first and last period covered.
- title, cond, loc, resrc: verbatim; join wrapped lines with one space; never expand or correct. Blank or "-" is null.
- Lanes: a day may split into sub-unit rows (P / M / SCT / SIG) or stacked lanes with their own REVEILLE and sub-rows (Group A/B,
  LF/non-LF). A block in every lane is one item; a block in only some lanes is its own item with comments "For: <lane>", e.g. "For: SCT".
- A thin strip over part of a block (e.g. "LMG L/F (ATTACHED TO ARCHER)") is its own item over its periods, comments
  "For: part of company"; the block under it stays an item.
- Two differently coloured activities stacked in one cell (e.g. "IFM 2 (4X1KM)" over "8KM RM") are two items with the same span,
  each with its own category, both with the cell's COND/LOC/RESRC.

REMARKS (start = end = "REMARKS")
- Each pale blue-grey banner across a whole day (e.g. "DRIVING TRADES (HUNTER)", "EPC", "SOIC2 COURSE") is one item.
- REMARKS column: one item per distinct note. Never copy remarks into other items.

SKIP: WEEKEND blocks with their "ALL / OUT OF CAMP"; blank days. Keep real weekend activities (e.g. "BOOK IN / LAST PARADE").

DATE: YYYY-MM-DD, year from "TRAINING PROGRAMME FOR dd/mm/yy - dd/mm/yy"; if none is visible, the year nearest to today, ${today}.

CATEGORY (fill colour): ${legend}. The sheet's own legend (bottom-left) wins. White fill and banners are null.

DOUBT: infer what is reasonable silently (merged cells, glare, lanes). When genuinely ambiguous (span, unreadable text, colour between
two categories, lane, one vs two activities), keep your best guess and start comments with "UNCERTAIN: <why>" for human review.
Red text is tentative: "UNCERTAIN: tentative (red text)".

If a block is the same activity as one of these existing titles, use that title exactly:
${existingTitles.map((t) => `  ${t}`).join("\n") || "  (none yet)"}`;
}

/**
 * Sends one image or PDF (as a data: URL) to the OpenAI Responses API and returns the parsed extraction.
 *
 * Args:
 *   file: The upload's name and data: URL.
 *   existingTitles: Activity titles already in the database.
 *   s: Current settings (model, effort, grid, lists).
 *
 * Raises:
 *   Error: If the API key is missing, the API fails, or it returns no output.
 */
export async function extract(file: { name: string; dataUrl: string }, existingTitles: string[], s: Settings): Promise<{ blocks: Block[] }> {
  const key = await secret("OPENAI_API_KEY");
  if (!key) throw new UserError("No OpenAI API key: set it in Settings or OPENAI_API_KEY");
  const media = file.dataUrl.startsWith("data:application/pdf")
    ? { type: "input_file", filename: file.name, file_data: file.dataUrl }
    : { type: "input_image", image_url: file.dataUrl, detail: "high" };
  // Env-only on purpose: an address editable in Settings could send the API key to any server.
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/responses`, {
    method: "POST",
    redirect: "manual",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: s.aiModel,
      reasoning: { effort: s.aiEffort },
      input: [{ role: "user", content: [{ type: "input_text", text: prompt(s, existingTitles) }, media] }],
      text: { format: { type: "json_schema", name: "training_programme", strict: true, schema: schema(s) } },
    }),
  });
  if (!res.ok) {
    console.error(`OpenAI ${res.status}:`, await res.text());
    throw new UserError(`OpenAI request failed (${res.status})`);
  }
  const body = await res.json();
  const text = body.output?.flatMap((o: { content?: { type: string; text: string }[] }) => o.content ?? [])
    .find((c: { type: string }) => c.type === "output_text")?.text;
  if (!text) throw new UserError("OpenAI returned no output");
  return JSON.parse(text);
}
