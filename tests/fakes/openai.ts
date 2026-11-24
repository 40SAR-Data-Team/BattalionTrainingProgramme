import type { Block } from "@trng/shared/programme/drafts";
import { mondayOf, sgDate, addDays } from "@trng/shared/common/periods";

/** A small Archer programme for the current week, as the AI would read it off a photo. */
export function sampleExtraction(): { blocks: Block[] } {
  const mon = mondayOf(sgDate(new Date()));
  return {
    blocks: [
      { date: mon, start: "1", end: "2", title: "UPLOADED PT", cond: "PTI", loc: "PARADE SQUARE", resrc: null, category: "Physical Training", comments: null },
      { date: addDays(mon, 1), start: "3", end: "5", title: "UPLOADED MAP READING", cond: "PL COMD", loc: "CLASSROOM 2", resrc: "MAPS", category: null, comments: "UNCERTAIN: end period unclear" },
      { date: addDays(mon, 2), start: "REMARKS", end: "REMARKS", title: "UPLOADED ADMIN DAY", cond: null, loc: null, resrc: null, category: null, comments: null },
    ],
  };
}

/** Fake OpenAI Responses API: answers POST /responses with `next()` as structured output. */
export class FakeOpenAI {
  calls = 0;
  next: () => { blocks: Block[] } = sampleExtraction;

  /** Handles one HTTP request from backend/openai.ts. */
  async handle(req: Request): Promise<Response> {
    if (req.method !== "POST" || !new URL(req.url).pathname.endsWith("/responses")) return new Response("not found", { status: 404 });
    if (!req.headers.get("authorization")?.startsWith("Bearer ")) return new Response("no key", { status: 401 });
    this.calls++;
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(this.next()) }] }] });
  }
}
