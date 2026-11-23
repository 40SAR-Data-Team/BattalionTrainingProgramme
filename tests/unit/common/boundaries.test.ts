import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Feature folders: each may import only `common` and itself. */
const FEATURES = ["common", "programme", "conflicts", "planner", "settings"];
const ROOT = join(import.meta.dir, "../../..");
const DIRS = ["shared", "backend", "frontend/app", "frontend/components"];

/** Feature named by a path segment, e.g. "(programme)" or "planner"; app-root files and login count as common. */
const featureOf = (segment: string | undefined) => {
  const name = segment?.replace(/[()]/g, "");
  return name && FEATURES.includes(name) ? name : "common";
};

/** Every .ts/.tsx file under `dir`, skipping node_modules and build output. */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name === "node_modules" || d.name.startsWith(".")) return [];
    const p = join(dir, d.name);
    return d.isDirectory() ? files(p) : /\.tsx?$/.test(d.name) ? [p] : [];
  });
}

/** Feature an import specifier points at, or null for packages outside the app. */
function target(spec: string, fileDir: string): string | null {
  const m = spec.match(/^@trng\/(?:shared|backend)\/([^/]+)\//) ?? spec.match(/^@\/(?:components|app)\/([^/]+)\//);
  if (m) return featureOf(m[1]);
  if (spec.startsWith("@/app/")) return "common"; // app-root files such as act.ts and actions.ts
  if (spec.startsWith("../")) return featureOf(relative(ROOT, join(fileDir, spec)).split(/[\\/]/)[1]);
  return null;
}

test("features import only common and themselves", () => {
  const bad: string[] = [];
  for (const dir of DIRS) {
    for (const file of files(join(ROOT, dir))) {
      const rel = relative(join(ROOT, dir), file).split(/[\\/]/);
      const own = featureOf(rel.length > 1 ? rel[0] : undefined);
      for (const [, spec] of readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)) {
        const to = target(spec, join(file, ".."));
        if (to && to !== "common" && to !== own) bad.push(`${relative(ROOT, file)} (${own}) -> ${spec}`);
      }
    }
  }
  expect(bad).toEqual([]);
});
