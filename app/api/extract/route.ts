import { sql } from "@/lib/db";
import { COMPANIES } from "@/lib/model";
import { extract, toDrafts } from "@/lib/extract";
import { requireUser } from "@/lib/session";

export const maxDuration = 300; // vision extraction of a dense grid can take a minute or more

/** POST {name, dataUrl, company?} → {company, drafts}: one uploaded page/PDF read into unsaved events. */
export async function POST(req: Request) {
  try { await requireUser(); } catch { return Response.json({ error: "Not signed in" }, { status: 401 }); }
  const { name, dataUrl, company } = await req.json();
  if (typeof dataUrl !== "string" || !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(dataUrl)) {
    return Response.json({ error: "Upload a JPEG, PNG, WebP or PDF" }, { status: 400 });
  }
  try {
    const titles = (await sql`select distinct title from events order by title limit 500`).map((r) => r.title as string);
    let result;
    try { result = await extract({ name: String(name), dataUrl }, titles); }
    catch { result = await extract({ name: String(name), dataUrl }, titles); } // one retry for transient/malformed output
    if ((COMPANIES as readonly string[]).includes(company)) result.company = company;
    if (result.company === "Unknown") return Response.json({ error: "Couldn't tell which company this is — pick one and retry" }, { status: 422 });
    return Response.json({ company: result.company, drafts: toDrafts(result) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
