/** A status message strip; `tone="good"` for confirmations, otherwise a warning. */
export function Notice({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "good" }) {
  const colors = tone === "good" ? "border-green-700/20 bg-green-50 text-green-900" : "border-orange-700/20 bg-orange-50 text-orange-950";
  return <p role="status" className={`rounded-xl border px-4 py-2.5 text-[14px] ${colors}`}>{children}</p>;
}
