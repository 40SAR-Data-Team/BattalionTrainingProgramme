import { CATEGORIES, COMPANIES, type Event } from "./model";
import { PERIODS, periodIndex, spanToTimes } from "./periods";

/** One activity block as read off the source grid by the LLM. */
export type Block = {
  date: string; start: string; end: string; title: string;
  cond: string | null; loc: string | null; resrc: string | null; category: string | null; comments: string | null;
};
export type Extraction = { company: string; blocks: Block[] };

const nullable = { type: ["string", "null"] };
const PERIOD_KEYS = [...PERIODS.map((p) => p.key), "REMARKS"];

/** JSON schema for OpenAI structured output. */
export const SCHEMA = {
  type: "object", additionalProperties: false, required: ["company", "blocks"],
  properties: {
    company: { type: "string", enum: [...COMPANIES, "Unknown"] },
    blocks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["date", "start", "end", "title", "cond", "loc", "resrc", "category", "comments"],
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          start: { type: "string", enum: PERIOD_KEYS }, end: { type: "string", enum: PERIOD_KEYS },
          title: { type: "string" }, cond: nullable, loc: nullable, resrc: nullable, comments: nullable,
          category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
        },
      },
    },
  },
};

/** Extraction instructions (rules from the ingesting-timetable-images skill) plus the known activity titles. */
export function prompt(existingTitles: string[]): string {
  return `You are reading a photographed weekly military training programme. Rows are days (Mon-Sun, date in the first column);
columns are fixed periods: ${PERIODS.map((p) => `${p.key}=${p.label} ${p.start}-${p.end}`).join(", ")}; the rightmost column is REMARKS.
Return every activity block as one item. Rules:
- One item per block, not per period. start/end are the keys of the first and last period the block spans. Trace the vertical
  gridlines instead of judging by text width; all blocks in a day row must together cover the row's 15 period columns. If a span
  is still unclear, keep your best guess and put "UNCERTAIN: <why>" in comments.
- title is every line in the block's tall top band joined with one space (e.g. "REVEILLE / BREAKFAST / DRAW ARMS").
  cond, loc, resrc are the texts on the COND, LOC and RESRC sub-rows. Transcribe word-for-word; do not expand or correct.
- A blank cell or a printed "-" is null.
- The REMARKS text of a day is its own item with start = end = "REMARKS". A full-width banner strip across a day row is also its own
  REMARKS item. Never copy remarks into other items.
- Skip blocks whose text is WEEKEND. Blank days produce nothing.
- date is ISO YYYY-MM-DD; take the year from the "TRAINING PROGRAMME FOR dd/mm/yy - dd/mm/yy" header.
- category comes from the cell colour legend: green = Outfield, blue = External Training, yellow = Physical Training,
  orange = Live Firing/HRA, grey = Off/Leave/Weekend; white/no colour = null.
- company is the company named in the title (e.g. "ARCHER COMPANY" = Archer).
- If a block is the same activity as one of these existing titles, use the existing title exactly as written:
${existingTitles.map((t) => `  ${t}`).join("\n") || "  (none yet)"}`;
}

/** Sends one image or PDF (as a data: URL) to the OpenAI Responses API and returns the parsed extraction. */
export async function extract(file: { name: string; dataUrl: string }, existingTitles: string[]): Promise<Extraction> {
  const media = file.dataUrl.startsWith("data:application/pdf")
    ? { type: "input_file", filename: file.name, file_data: file.dataUrl }
    : { type: "input_image", image_url: file.dataUrl, detail: "high" };
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt(existingTitles) }, media] }],
      text: { format: { type: "json_schema", name: "training_programme", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = body.output?.flatMap((o: { content?: { type: string; text: string }[] }) => o.content ?? [])
    .find((c: { type: string }) => c.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI returned no output");
  return JSON.parse(text);
}

/** Turns extracted blocks into unsaved events (period spans → times; REMARKS → all-day). */
export function toDrafts({ company, blocks }: Extraction): Event[] {
  return blocks.map((b) => ({
    id: crypto.randomUUID(), title: b.title.trim(),
    ...(b.start === "REMARKS" || b.end === "REMARKS"
      ? { start_at: `${b.date}T00:00:00+08:00`, end_at: `${b.date}T00:00:00+08:00`, all_day: true }
      : { ...spanToTimes(b.date, periodIndex(b.start), Math.max(periodIndex(b.start), periodIndex(b.end))), all_day: false }),
    cond: b.cond, loc: b.loc, resrc: b.resrc, comments: b.comments, category: b.category,
    companies: [company], google: {}, attrs: {},
  }));
}

const norm = (s: string | null) => (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
/** Identity of an activity occurrence, used to merge and de-duplicate. */
const key = (e: Event) => [norm(e.title), new Date(e.start_at).getTime(), new Date(e.end_at).getTime(), norm(e.loc), norm(e.cond)].join("|");

/** Merges drafts that are the same activity occurrence in several companies into one multi-company event. */
export function merge(drafts: Event[]): Event[] {
  const byKey = new Map<string, Event>();
  for (const d of drafts) {
    const hit = byKey.get(key(d));
    if (hit) hit.companies = [...new Set([...hit.companies, ...d.companies])];
    else byKey.set(key(d), { ...d, companies: [...d.companies] });
  }
  return [...byKey.values()];
}

/** Drops companies (and then drafts) that already have the same activity occurrence, so re-uploads append. */
export function withoutExisting(drafts: Event[], existing: Event[]): Event[] {
  const have = new Map<string, Set<string>>();
  for (const e of existing) have.set(key(e), new Set([...(have.get(key(e)) ?? []), ...e.companies]));
  return drafts
    .map((d) => ({ ...d, companies: d.companies.filter((c) => !have.get(key(d))?.has(c)) }))
    .filter((d) => d.companies.length);
}
