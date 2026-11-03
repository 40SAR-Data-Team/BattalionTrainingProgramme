"use client";
import { useState } from "react";
import { secondsLeft } from "@trng/shared/periods";

type Steps = { label: string; done: number; total: number; started: number; left: number | null } | null;

/** Spinning ring that says "still working". */
export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} />;
}

/**
 * Runs slow work item by item and tracks progress for <Progress>.
 *
 * Returns:
 *   steps: Current progress, or null when idle.
 *   run: Calls `fn` on each item (one after another, or all at once when `parallel`), ticking after each;
 *     `label` names the work shown next to the bar.
 */
export function useSteps() {
  const [steps, setSteps] = useState<Steps>(null);
  async function run<T>(label: string, items: T[], fn: (item: T) => Promise<unknown>, parallel = false) {
    setSteps({ label, done: 0, total: items.length, started: Date.now(), left: null });
    const tick = () => setSteps((s) => s && { ...s, done: s.done + 1, left: secondsLeft(s.done + 1, s.total, Date.now() - s.started) });
    try {
      if (parallel) await Promise.all(items.map((i) => fn(i).finally(tick)));
      else for (const i of items) await fn(i).finally(tick);
    } finally {
      setSteps(null);
    }
  }
  return { steps, run };
}

/** Standard "please wait" strip: spinner, bar, percentage and time left. Renders nothing when idle. */
export function Progress({ steps }: { steps: Steps }) {
  if (!steps) return null;
  const pct = Math.round((steps.done / Math.max(steps.total, 1)) * 100);
  return (
    <div role="status" className="flex items-center gap-3 rounded-xl border border-hairline bg-white px-4 py-2.5 text-[14px] shadow-sm">
      <Spinner className="text-primary" />
      <span className="font-medium">{steps.label}</span>
      <progress value={steps.done} max={steps.total} className="h-2 flex-1 accent-primary" aria-label={steps.label} />
      <span className="tabular-nums">{pct}%</span>
      <span className="w-24 text-right text-muted tabular-nums">{steps.left === null ? "Estimating…" : `~${steps.left}s left`}</span>
    </div>
  );
}
