/** The unit's name set as a badge: red tile, yellow condensed lettering — the flag's colours reversed. */
export function UnitMark({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`grid place-items-center rounded-[22%] bg-primary font-display font-bold tracking-tight text-canvas shadow-sm ${className}`}>
      {name}
    </span>
  );
}
