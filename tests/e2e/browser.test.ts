/**
 * Runs the Playwright suite (`*.e2e.ts`) from `bun test`, so one command covers unit, integration and e2e.
 * Playwright needs its own runner, so this spawns it and passes only if every browser test passes.
 */
import { expect, test } from "bun:test";

test("every end-to-end use case passes in a real browser (Playwright)", () => {
  const run = Bun.spawnSync(["bun", "run", "e2e"], { cwd: `${import.meta.dir}/..`, stdout: "inherit", stderr: "inherit" });
  expect(run.exitCode).toBe(0);
}, 600_000);
