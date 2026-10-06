"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSecret, saveSettings, signOutEveryone, unlockSettings, type Result } from "@/app/actions";
import type { SecretName, SecretSource } from "@trng/backend/secrets";
import { EFFORTS, type Settings } from "@trng/shared/model";
import { Notice } from "./Notice";

/** Google Calendar's event colours, by colorId. */
const GOOGLE_COLORS = ["Lavender", "Sage", "Grape", "Flamingo", "Banana", "Tangerine", "Peacock", "Graphite", "Blueberry", "Basil", "Tomato"];

const SECRET_LABELS: Record<SecretName, { label: string; hint: string; multiline?: boolean }> = {
  ACCESS_KEY: { label: "Access key", hint: "The key clerks type on the sign-in page. Changing it signs everyone out." },
  OPENAI_API_KEY: { label: "OpenAI API key", hint: "Used to read uploaded programmes." },
  GOOGLE_SERVICE_ACCOUNT_KEY: { label: "Google service account key", hint: "Paste the whole JSON key file.", multiline: true },
};

const input = "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[15px] disabled:bg-transparent";
const card = "rounded-2xl border border-hairline bg-white p-5 shadow-sm";

/** Every user-adjustable setting, edited in place and saved together. */
export function SettingsForm({ initial, defaults, admin, adminConfigured, secrets }: {
  initial: Settings; defaults: Settings; admin: boolean; adminConfigured: boolean; secrets: Record<SecretName, SecretSource>;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((old) => ({ ...old, [k]: v }));

  /** Runs a settings action, shows its result, and reloads server data on success. */
  function run(action: () => Promise<Result>) {
    start(async () => {
      const r = await action();
      setResult(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className={`${card} flex flex-wrap items-center gap-4`}>
        <h1 className="font-display text-[26px] font-bold tracking-tight text-heading">Settings</h1>
        {admin
          ? <span className="text-muted">Unlocked for editing.</span>
          : <AdminUnlock disabled={!adminConfigured || pending} onUnlock={(key) => run(() => unlockSettings(key))} />}
        {!adminConfigured && <span className="text-muted">Editing is off until ADMIN_KEY is set on the server.</span>}
      </header>
      {result && <Notice tone={result.ok ? "good" : "warn"}>{result.ok ? result.message ?? "Done" : result.message}</Notice>}

      <form onSubmit={(e) => { e.preventDefault(); run(() => saveSettings(s)); }} className="flex flex-col gap-4">
        <fieldset disabled={!admin || pending} className="contents">
          <Section title="Unit" note="Calendars are named from the template; {unit} and {company} are filled in.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Unit name"><input className={input} value={s.unitName} onChange={(e) => set("unitName", e.target.value)} /></Field>
              <Field label="Calendar name"><input className={input} value={s.calendarName} onChange={(e) => set("calendarName", e.target.value)} /></Field>
              <Field label="Calendar owner (Google account email)">
                <input className={input} type="email" value={s.calendarOwner} placeholder="Uses GOOGLE_CALENDAR_OWNER if blank" onChange={(e) => set("calendarOwner", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Companies" note="Order here is the tab order. A new company gets its own Google Calendar on the next sync; renaming one starts a new calendar.">
            <Rows items={s.companies} onChange={(v) => set("companies", v)} blank={{ name: "", color: "#e5e7eb" }}
              render={(c, edit) => <>
                <input aria-label="Company name" className={input} value={c.name} onChange={(e) => edit({ name: e.target.value })} />
                <input aria-label={`${c.name} colour`} type="color" className="h-10 w-14 shrink-0 rounded" value={c.color} onChange={(e) => edit({ color: e.target.value })} />
              </>} />
          </Section>

          <Section title="Categories" note="Colour in the app, colour in Google Calendar, and the cell colour on the paper programme that the AI looks for.">
            <Rows items={s.categories} onChange={(v) => set("categories", v)} blank={{ name: "", color: "#e5e7eb", googleColorId: "8", legend: "" }}
              render={(c, edit) => <>
                <input aria-label="Category name" className={input} value={c.name} onChange={(e) => edit({ name: e.target.value })} />
                <input aria-label={`${c.name} colour`} type="color" className="h-10 w-14 shrink-0 rounded" value={c.color} onChange={(e) => edit({ color: e.target.value })} />
                <select aria-label={`${c.name} Google colour`} className={input} value={c.googleColorId} onChange={(e) => edit({ googleColorId: e.target.value })}>
                  {GOOGLE_COLORS.map((name, i) => <option key={name} value={String(i + 1)}>{name}</option>)}
                </select>
                <input aria-label={`${c.name} paper colour`} className={input} placeholder="Paper colour, e.g. green" value={c.legend} onChange={(e) => edit({ legend: e.target.value })} />
              </>} />
          </Section>

          <Section title="Periods" note="The timetable columns, in time order. Existing activities snap to the nearest period if you change the times.">
            <Rows items={s.periods} onChange={(v) => set("periods", v)} blank={{ key: "", label: "", start: "18:00", end: "18:50" }}
              render={(p, edit) => <>
                <input aria-label="Period key" className={`${input} w-20`} placeholder="Key" value={p.key} onChange={(e) => edit({ key: e.target.value })} />
                <input aria-label={`Period ${p.key} label`} className={input} placeholder="Label" value={p.label} onChange={(e) => edit({ label: e.target.value })} />
                <input aria-label={`Period ${p.key} start`} type="time" className={input} value={p.start} onChange={(e) => edit({ start: e.target.value })} />
                <input aria-label={`Period ${p.key} end`} type="time" className={input} value={p.end} onChange={(e) => edit({ end: e.target.value })} />
              </>} />
          </Section>

          <Section title="Behaviour">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="AI model"><input className={input} value={s.aiModel} onChange={(e) => set("aiModel", e.target.value)} /></Field>
              <Field label="AI reasoning effort">
                <select className={input} value={s.aiEffort} onChange={(e) => set("aiEffort", e.target.value as Settings["aiEffort"])}>
                  {EFFORTS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <NumberField label="Upcoming list covers (days)" value={s.upcomingDays} onChange={(v) => set("upcomingDays", v)} />
              <NumberField label="Keep past activities for (days)" value={s.lookbackDays} onChange={(v) => set("lookbackDays", v)} />
              <NumberField label="Shrink photos to (pixels, longest side)" value={s.photoMaxPx} onChange={(v) => set("photoMaxPx", v)} />
              <NumberField label="Stay signed in for (days)" value={s.sessionDays} onChange={(v) => set("sessionDays", v)} />
            </div>
          </Section>

          {admin && (
            <div className="sticky bottom-4 flex justify-end gap-2 rounded-2xl border border-hairline bg-white/95 p-3 shadow-lg backdrop-blur">
              <button type="button" onClick={() => setS(defaults)} className="rounded-full px-4 py-2 font-medium hover:bg-canvas">Restore defaults</button>
              <button type="button" onClick={() => setS(initial)} className="rounded-full px-4 py-2 font-medium hover:bg-canvas">Discard changes</button>
              <button className="rounded-full bg-primary px-6 py-2 font-semibold text-white transition hover:bg-primary-dark active:scale-95">
                {pending ? "Saving…" : "Save settings"}
              </button>
            </div>
          )}
        </fieldset>
      </form>

      <Section title="Keys and passwords" note="Saved encrypted and never shown again. Leave blank and press Clear to fall back to the server's environment variable.">
        <div className="flex flex-col gap-4">
          {(Object.keys(SECRET_LABELS) as SecretName[]).map((name) => (
            <SecretField key={name} name={name} source={secrets[name]} disabled={!admin || pending} onSave={(v) => run(() => saveSecret(name, v))} />
          ))}
        </div>
      </Section>

      <Section title="Sign-ins" note="Signs every browser out, this one included. Everyone signs in again with the access key. Use it if a device or the key may have leaked.">
        <button type="button" disabled={!admin || pending}
          onClick={() => confirm("Sign every browser out, including this one?") && run(() => signOutEveryone())}
          className="rounded-full bg-ink px-5 py-2 font-semibold text-white disabled:opacity-40">Sign everyone out</button>
      </Section>
    </div>
  );
}

/** Admin key prompt that unlocks editing. */
function AdminUnlock({ disabled, onUnlock }: { disabled: boolean; onUnlock: (key: string) => void }) {
  const [key, setKey] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onUnlock(key); }} className="ml-auto flex flex-wrap gap-2">
      <label htmlFor="admin-key" className="sr-only">Admin key</label>
      <input id="admin-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key" disabled={disabled}
        className="h-10 rounded-full border border-hairline px-4" />
      <button disabled={disabled || !key} className="h-10 rounded-full bg-ink px-5 font-semibold text-white disabled:opacity-50">Unlock editing</button>
    </form>
  );
}

/** A titled settings card. */
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <h2 className="font-display text-[20px] font-semibold">{title}</h2>
      {note && <p className="mt-1 mb-4 max-w-prose text-[14px] text-muted">{note}</p>}
      <div className={note ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

/** A labelled control. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-[14px] font-medium">{label}{children}</label>;
}

/** A labelled positive whole number. */
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <Field label={label}><input className={input} type="number" min={1} step={1} value={value} onChange={(e) => onChange(e.target.valueAsNumber)} /></Field>;
}

/** Editable list: each row rendered by `render`, with move up / down / remove, and an Add button. */
function Rows<T extends object>({ items, onChange, blank, render }: {
  items: T[]; onChange: (v: T[]) => void; blank: T; render: (item: T, edit: (patch: Partial<T>) => void) => React.ReactNode;
}) {
  const at = (i: number, item: T) => onChange(items.map((x, j) => (j === i ? item : x)));
  const swap = (i: number, j: number) => { const v = [...items]; [v[i], v[j]] = [v[j], v[i]]; onChange(v); };
  const icon = "grid size-9 shrink-0 place-items-center rounded-full hover:bg-canvas disabled:opacity-30";
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          {render(item, (patch) => at(i, { ...item, ...patch }))}
          <button type="button" className={icon} onClick={() => swap(i, i - 1)} disabled={i === 0} aria-label="Move up">↑</button>
          <button type="button" className={icon} onClick={() => swap(i, i + 1)} disabled={i === items.length - 1} aria-label="Move down">↓</button>
          <button type="button" className={`${icon} text-primary`} onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, blank])} className="self-start rounded-full px-3 py-1.5 font-medium text-primary hover:bg-canvas">Add</button>
    </div>
  );
}

/** Write-only secret: shows where the current value comes from, never the value. */
function SecretField({ name, source, disabled, onSave }: { name: SecretName; source: SecretSource; disabled: boolean; onSave: (v: string) => void }) {
  const [value, setValue] = useState("");
  const { label, hint, multiline } = SECRET_LABELS[name];
  const status = { settings: "Set here", environment: "From server environment", unset: "Not set" }[source];
  const props = { id: name, value, disabled, autoComplete: "off", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value), className: input };
  return (
    <div>
      <label htmlFor={name} className="flex items-baseline justify-between text-[14px] font-medium">
        {label}<span className={`text-[13px] ${source === "unset" ? "text-primary" : "text-muted"}`}>{status}</span>
      </label>
      <p className="mb-1 text-[13px] text-muted">{hint}</p>
      <div className="flex gap-2">
        {multiline ? <textarea rows={2} {...props} placeholder="New value" /> : <input type="password" {...props} placeholder="New value" />}
        <button type="button" disabled={disabled || !value} onClick={() => { onSave(value); setValue(""); }} className="rounded-full bg-ink px-4 font-semibold text-white disabled:opacity-40">Save</button>
        <button type="button" disabled={disabled || source !== "settings"} onClick={() => onSave("")} className="rounded-full px-4 font-medium hover:bg-canvas disabled:opacity-40">Clear</button>
      </div>
    </div>
  );
}
