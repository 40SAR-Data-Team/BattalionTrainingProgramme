"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { commitDraft } from "@/app/actions";
import { EventDialog } from "@/components/EventDialog";
import { Timetable } from "@/components/Timetable";
import { COMPANIES, type Event } from "@/lib/model";
import { merge } from "@/lib/extract";
import { addDays, mondayOf, moveTo, sgDate } from "@/lib/periods";

type Page = { name: string; status: "reading" | "done" | "error"; message?: string };

/** Reads a file as a data: URL; photos are downscaled to ≤2400px JPEG to stay under Vercel's 4.5 MB body cap. */
async function toDataUrl(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    // ponytail: PDFs are sent as-is; move uploads to Vercel Blob if they exceed ~3 MB.
    return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = fail; r.readAsDataURL(file); });
  }
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Upload images/PDF → review the extracted draft in the timetable → commit to Google Calendar. */
export default function UploadPage() {
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
          const res = await fetch("/api/extract", { method: "POST", body: JSON.stringify({ name: file.name, dataUrl: await toDataUrl(file), company }) });
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
      <nav className="flex h-11 items-center gap-6 bg-black px-4 text-[12px] text-white">
        <Link href="/" className="font-semibold">40SAR Training Programme</Link>
        <span className="ml-auto">Upload</span>
      </nav>
      <header className="flex flex-wrap items-center gap-4 border-b border-black/10 bg-parchment px-4 py-3 text-[14px]">
        <h1 className="text-[21px] font-semibold tracking-tight">Upload training programme</h1>
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-full border border-black/10 bg-white px-3 py-1.5">
          <option value="">Company: detect from image</option>
          {COMPANIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-white transition active:scale-95">
          Choose images or PDF
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => read(e.target.files)} />
        </label>
        {drafts.length > 0 && (
          <button onClick={commit} disabled={committing || reading}
            className="ml-auto rounded-full bg-ink px-5 py-1.5 text-white transition active:scale-95 disabled:opacity-50">
            {committing ? "Saving to Google Calendar…" : `Commit ${drafts.length} events`}
          </button>
        )}
      </header>
      <main className="flex flex-1 flex-col gap-3 p-4 text-[14px]">
        {pages.map((p) => (
          <p key={p.name} className={p.status === "error" ? "text-red-600" : "text-zinc-600"}>
            {p.status === "reading" ? "Reading" : p.status === "done" ? "Read" : "Failed"} {p.name}{p.message ? ` — ${p.message}` : "…"}
          </p>
        ))}
        {message && <p role="status" className="rounded-lg bg-orange-50 px-3 py-2 text-orange-900">{message}</p>}
        {uncertain > 0 && <p className="rounded-lg bg-orange-50 px-3 py-2 text-orange-900">{uncertain} blocks are marked UNCERTAIN — check them against the original before committing.</p>}
        {week && <>
          <div className="flex items-center gap-2">
            <button onClick={() => setWeek(addDays(week, -7))} className="rounded-full px-3 py-1 hover:bg-black/5" aria-label="Previous week">‹</button>
            <span>Week of {week}</span>
            <button onClick={() => setWeek(addDays(week, 7))} className="rounded-full px-3 py-1 hover:bg-black/5" aria-label="Next week">›</button>
            <span className="text-zinc-500">Review, drag or click to fix, then commit.</span>
          </div>
          <Timetable events={drafts} week={week} showCompanies onOpen={setEditing}
            onMove={(id, day, period) => setDrafts((all) => all.map((d) => (d.id === id && !d.all_day ? moveTo(d, day, period) : d)))} />
        </>}
        {!pages.length && <p className="py-16 text-center text-[17px] text-zinc-500">Choose one or more photos of the training programme, or a PDF.</p>}
      </main>
      <EventDialog event={editing} onClose={() => setEditing(null)}
        onSave={(e) => { setDrafts((all) => all.map((d) => (d.id === e.id ? e : d))); setEditing(null); }}
        onDelete={(e) => { setDrafts((all) => all.filter((d) => d.id !== e.id)); setEditing(null); }} />
    </div>
  );
}
