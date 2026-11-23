"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions";
import { useSettings } from "@/components/common/SettingsContext";
import { UnitMark } from "@/components/common/UnitMark";

const LINKS = [
  { href: "/", label: "Training Programme" },
  { href: "/conflicts", label: "Conflict Checker" },
  { href: "/upload", label: "Upload" },
  { href: "/settings", label: "Settings" },
];

/** White top bar shared by every signed-in page: unit mark, page links, and an optional slot (search). */
export function NavBar({ children }: { children?: React.ReactNode }) {
  const path = usePathname();
  const { unitName } = useSettings();
  return (
    <nav className="sticky top-0 z-30 border-b border-hairline bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <Link href="/" className="flex items-center gap-2.5">
          <UnitMark name={unitName} className="w-8" />
          <span className="font-display text-[19px] font-semibold tracking-tight">Training Programme</span>
        </Link>
        <div className="flex gap-1 text-[15px]">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}
              className="rounded-full px-3 py-1.5 font-medium text-muted hover:bg-canvas hover:text-ink aria-[current=page]:bg-canvas aria-[current=page]:text-heading">
              {l.label}
            </Link>
          ))}
        </div>
        {children && <div className="ml-auto w-full sm:w-auto sm:min-w-[22rem]">{children}</div>}
        <form action={signOut} className={children ? "" : "ml-auto"}>
          <button className="rounded-full px-3 py-1.5 text-[15px] font-medium text-muted hover:bg-canvas hover:text-ink">Sign out</button>
        </form>
      </div>
    </nav>
  );
}
