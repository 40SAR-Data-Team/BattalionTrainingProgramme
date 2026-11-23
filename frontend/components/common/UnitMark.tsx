import Image from "next/image";
import crest from "@/assets/40sar.png";

/** The unit crest. A static import, so it is served from /_next/static and shows on the signed-out login page too. */
export function UnitMark({ name, className = "" }: { name: string; className?: string }) {
  return <Image src={crest} alt={`${name} crest`} priority className={`h-auto object-contain ${className}`} />;
}
