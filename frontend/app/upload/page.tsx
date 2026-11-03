"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { commitDraft } from "@/app/actions";
import { EventDialog } from "@/components/EventDialog";
import { NavBar } from "@/components/NavBar";
import { Notice } from "@/components/Notice";
import { Progress, useSteps } from "@/components/Progress";
import { useSettings } from "@/components/SettingsContext";
import { Timetable } from "@/components/Timetable";
import { WeekNav } from "@/components/WeekNav";
import type { Event } from "@trng/shared/model";
import { blankEvent, merge, upsert } from "@trng/shared/drafts";
import { mondayOf, moveTo, sgDate } from "@trng/shared/periods";

type Page = { name: string; status: "reading" | "done" | "error"; message?: string };

/** Reads a file as a data: URL; photos are downscaled to `maxPx` JPEG to stay under Vercel's 4.5 MB body cap. */
async function toDataUrl(file: File, maxPx: number): Promise<string> {
  if (file.type === "application/pdf") {
    // ponytail: PDFs are sent as-is; move uploads to Vercel Blob if they exceed ~3 MB.
    return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = fail; r.readAsDataURL(file); });
  }
  const img = await createImageBitmap(file);
  const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Upload images/PDF → review the extracted draft in the timetable → commit to Google Calendar. */
export default function UploadPage() {
  const { companies, periods, photoMaxPx } = useSettings();
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [cleared, setCleared] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [drafts, setDrafts] = useState<Event[]>([]);
  const [week, setWeek] = useState<string | null>(null);
  const [editing, setEditing] = useState<Event | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { steps, run } = useSteps();
  const uncertain = drafts.filter((d) => d.comments?.startsWith("UNCERTAIN")).length;

  /** Sends one file to /api/extract and merges its blocks into the draft. */
  async function readOne(file: File) {
    const set = (p: Partial<Page>) => setPages((all) => all.map((x) => (x.name === file.name ? { ...x, ...p } : x)));
    setPages((all) => [...all.filter((x) => x.name !== file.name), { name: file.name, status: "reading" }]);
    try {
      const res = await fetch("/api/extract", { method: "POST", body: JSON.stringify({ name: file.name, dataUrl: await toDataUrl(file, photoMaxPx), company }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setDrafts((all) => merge([...all, ...body.drafts]));
      setWeek((w) => w ?? mondayOf(sgDate(body.drafts[0]?.start_at ?? new Date())));
      set({ status: "done", message: `${company}: ${body.drafts.length} blocks` });
    } catch (err) {
      set({ status: "error", message: (err as Error).message });
    }
  }

  /** Saves the reviewed draft a few events at a time (so progress shows) and appends them to the company calendars. */
  async function commit() {
    setMessage(null);
    const chunks = Array.from({ length: Math.ceil(drafts.length / 5) }, (_, i) => drafts.slice(i * 5, i * 5 + 5));
    // Chunks run one after another (so commitDrafts' duplicate check sees earlier ones); a throw stops the rest.
    await run(`Adding ${drafts.length} activities to Google Calendar`, chunks, async (c) => {
      const r = await commitDraft(c);
      if (!r.ok) throw new Error(r.message);
    }).then(() => router.push("/"), (err) => setMessage(err.message));
  }

  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5 text-[14px]">
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-white px-4 py-3 shadow-sm">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-heading">Upload a programme</h1>
          <label htmlFor="company" className="font-semibold text-heading">Which company&apos;s training programme are you uploading?</label>
          <select id="company" value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-full border border-hairline bg-white px-3 py-2">
            <option value="" disabled>Choose company</option>
            {companies.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
          {/* Company first: the upload controls stay hidden until one is picked. */}
          {company && <>
          <label className="flex max-w-md items-start gap-2 text-[13px] text-heading">
            <input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)} className="mt-0.5" />
            <span>I confirm this programme is within security classification requirements to be processed by OpenAI and stored in Google Calendar.</span>
          </label>
          <label className={`rounded-full bg-ink px-4 py-2 font-semibold text-white transition focus-within:outline-2 focus-within:outline-primary ${cleared && company ? "cursor-pointer active:scale-95" : "opacity-50"}`}>
            Choose files
            <input type="file" multiple disabled={!cleared || !company} accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => void run("Reading programme", Array.from(e.target.files ?? []), readOne, true)} />
          </label>
          <button onClick={() => setEditing(blankEvent(periods, week ?? sgDate(new Date()), company ? [company] : []))}
            className="rounded-full border border-hairline px-4 py-2 font-semibold transition hover:bg-canvas active:scale-95">
            New activity
          </button>
          </>}
          {drafts.length > 0 && (
            <button onClick={() => void commit()} disabled={!!steps}
              className="ml-auto rounded-full bg-primary px-5 py-2 font-semibold text-white transition hover:bg-primary-dark active:scale-95 disabled:opacity-50">
              {`Add ${drafts.length} activities to Google Calendar`}
            </button>
          )}
        </section>
        <Progress steps={steps} />
        {pages.map((p) => (
          <p key={p.name} role="status" className={p.status === "error" ? "font-medium text-primary" : "text-heading"}>
            {p.status === "reading" ? "Reading" : p.status === "done" ? "Read" : "Couldn't read"} {p.name}{p.message ? `: ${p.message}` : "…"}
          </p>
        ))}
        {message && <Notice>{message}</Notice>}
        {uncertain > 0 && <Notice>{uncertain} blocks have an orange outline: the AI wasn&apos;t sure. Check them against the original before adding.</Notice>}
        {week && <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white px-4 py-2 shadow-sm">
            <WeekNav week={week} onChange={setWeek} />
            <span className="text-muted">Drag a block to move it, or click it to fix the details.</span>
          </div>
          <Timetable events={drafts} week={week} showCompanies onOpen={setEditing}
            onMove={(id, day, period) => setDrafts((all) => all.map((d) => (d.id === id && !d.all_day ? moveTo(periods, d, day, period) : d)))} />
        </>}
        {!pages.length && !drafts.length && (
          <div className="grid flex-1 place-items-center rounded-2xl border-2 border-dashed border-heading/30 bg-white/70 p-12 text-center">
            <div>
              <p className="font-display text-[22px] font-semibold text-heading">{company ? `Choose ${company}'s weekly training programme to upload` : "Which company's training programme are you uploading?"}</p>
              <p className="mt-2 text-muted">Pick the company above first, then confirm the security classification first. One file per company is fine. You&apos;ll review every block before anything reaches Google Calendar.</p>
            </div>
          </div>
        )}
      </main>
      <EventDialog event={editing} onClose={() => setEditing(null)}
        onSave={(e) => { setDrafts((all) => upsert(all, e)); setWeek((w) => w ?? mondayOf(sgDate(e.start_at))); setEditing(null); }}
        onDelete={(e) => { setDrafts((all) => all.filter((d) => d.id !== e.id)); setEditing(null); }} />
    </div>
  );
}
