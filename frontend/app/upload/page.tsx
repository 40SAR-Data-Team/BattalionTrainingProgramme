"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { commitDraft } from "@/app/actions";
import { EventDialog } from "@/components/EventDialog";
import { NavBar } from "@/components/NavBar";
import { Notice } from "@/components/Notice";
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
  const [pages, setPages] = useState<Page[]>([]);
  const [drafts, setDrafts] = useState<Event[]>([]);
  const [week, setWeek] = useState<string | null>(null);
  const [editing, setEditing] = useState<Event | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [committing, startCommit] = useTransition();
  const uncertain = drafts.filter((d) => d.comments?.startsWith("UNCERTAIN")).length;
  const reading = pages.some((p) => p.status === "reading");

  /** Sends each file to /api/extract in parallel and merges results into the draft as they arrive. */
  function read(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      const set = (p: Partial<Page>) => setPages((all) => all.map((x) => (x.name === file.name ? { ...x, ...p } : x)));
      setPages((all) => [...all.filter((x) => x.name !== file.name), { name: file.name, status: "reading" }]);
      (async () => {
        try {
          const res = await fetch("/api/extract", { method: "POST", body: JSON.stringify({ name: file.name, dataUrl: await toDataUrl(file, photoMaxPx), company }) });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          setDrafts((all) => merge([...all, ...body.drafts]));
          setWeek((w) => w ?? mondayOf(sgDate(body.drafts[0]?.start_at ?? new Date())));
          set({ status: "done", message: `${body.company}: ${body.drafts.length} blocks` });
        } catch (err) {
          set({ status: "error", message: (err as Error).message });
        }
      })();
    }
  }

  /** Saves the reviewed draft and appends it to the company calendars. */
  function commit() {
    startCommit(async () => {
      const r = await commitDraft(drafts);
      if (r.ok) router.push("/");
      else setMessage(r.message);
    });
  }

  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-5 text-[14px]">
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-hairline bg-white px-4 py-3 shadow-sm">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-heading">Upload a programme</h1>
          <label className="sr-only" htmlFor="company">Company</label>
          <select id="company" value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-full border border-hairline bg-white px-3 py-2">
            <option value="">Detect company from the page</option>
            {companies.map((c) => <option key={c.name}>{c.name}</option>)}
          </select>
          <label className="cursor-pointer rounded-full bg-ink px-4 py-2 font-semibold text-white transition focus-within:outline-2 focus-within:outline-primary active:scale-95">
            Choose photos or PDF
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => read(e.target.files)} />
          </label>
          <button onClick={() => setEditing(blankEvent(periods, week ?? sgDate(new Date()), company ? [company] : []))}
            className="rounded-full border border-hairline px-4 py-2 font-semibold transition hover:bg-canvas active:scale-95">
            New activity
          </button>
          {drafts.length > 0 && (
            <button onClick={commit} disabled={committing || reading}
              className="ml-auto rounded-full bg-primary px-5 py-2 font-semibold text-white transition hover:bg-primary-dark active:scale-95 disabled:opacity-50">
              {committing ? "Adding to Google Calendar…" : `Add ${drafts.length} activities to Google Calendar`}
            </button>
          )}
        </section>
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
              <p className="font-display text-[22px] font-semibold text-heading">Choose photos or a PDF of the weekly training programme</p>
              <p className="mt-2 text-muted">One photo per company is fine. You&apos;ll review every block before anything reaches Google Calendar.</p>
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
