/**
 * Starts the fake Google Calendar, OpenAI and Neon servers.
 * Imported by integration tests (random ports) and run directly for e2e / offline dev (`bun fakes/serve.ts`, fixed ports).
 */
import { FakeGoogle } from "./google";
import { FakeNeon } from "./neon";
import { FakeOpenAI } from "./openai";

/** Starts all fakes; port 0 picks a free port. The fake Neon starts empty; call `neon.seed()`. */
export function startFakes(googlePort = 0, openaiPort = 0, neonPort = 0) {
  const google = new FakeGoogle();
  const openai = new FakeOpenAI();
  const neon = new FakeNeon();
  const g = Bun.serve({ port: googlePort, fetch: (r) => google.handle(r) });
  const o = Bun.serve({ port: openaiPort, fetch: (r) => openai.handle(r) });
  const n = Bun.serve({ port: neonPort, fetch: (r) => neon.handle(r) });
  return {
    google, openai, neon,
    googleRoot: `http://localhost:${g.port}/`,
    openaiUrl: `http://localhost:${o.port}`,
    neonEndpoint: `http://localhost:${n.port}/sql`,
    stop: () => { g.stop(true); o.stop(true); n.stop(true); },
  };
}

/** Any well-formed Postgres URL works: the Neon driver only needs one, and NEON_FETCH_ENDPOINT routes the queries. */
export const FAKE_DATABASE_URL = "postgresql://fake:fake@fake-neon.local/fake";

if (import.meta.main) {
  const f = startFakes(4010, 4011, 4012);
  await f.neon.seed();
  console.log(`Fake Google at ${f.googleRoot}, fake OpenAI at ${f.openaiUrl}, fake Neon at ${f.neonEndpoint} (seeded)`);
}
