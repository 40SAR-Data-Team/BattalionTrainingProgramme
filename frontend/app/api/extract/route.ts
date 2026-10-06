import { readUpload } from "@trng/backend/events";
import { requireUser } from "@trng/backend/session";
import { publicMessage } from "@trng/shared/errors";

export const maxDuration = 300; // vision extraction of a dense grid can take a minute or more

/** POST {name, dataUrl, company?} → {company, drafts}: one uploaded page/PDF read into unsaved events. */
export async function POST(req: Request) {
  try { await requireUser(); } catch { return Response.json({ error: "Not signed in" }, { status: 401 }); }
  const { name, dataUrl, company } = await req.json();
  if (typeof dataUrl !== "string" || !/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(dataUrl)) {
    return Response.json({ error: "Upload a JPEG, PNG, WebP or PDF" }, { status: 400 });
  }
  try {
    return Response.json(await readUpload({ name: String(name), dataUrl }, String(company ?? "")));
  } catch (err) {
    return Response.json({ error: publicMessage(err) }, { status: 422 });
  }
}
