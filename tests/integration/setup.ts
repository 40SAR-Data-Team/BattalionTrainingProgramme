/**
 * Shared world for integration tests: fake Neon (in-memory PGlite) seeded with the dummy programme, fake Google
 * Calendar and fake OpenAI, and settings pointing at them. Every backend module reads env lazily, so setting env here is enough.
 */
import { afterAll } from "bun:test";
import { FAKE_DATABASE_URL, startFakes } from "../fakes/serve";

process.env.DATABASE_URL = FAKE_DATABASE_URL;
process.env.ADMIN_KEY = "test-admin-key";
process.env.ACCESS_KEY = "test-access-key";
process.env.OPENAI_API_KEY = "sk-fake";
delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

export const fakes = startFakes();
process.env.GOOGLE_API_ROOT = fakes.googleRoot;
process.env.OPENAI_BASE_URL = fakes.openaiUrl;
process.env.NEON_FETCH_ENDPOINT = fakes.neonEndpoint;
afterAll(() => fakes.stop());

await fakes.neon.seed();
const { saveSettings } = await import("@trng/backend/settings");
await saveSettings({ calendarOwner: "owner@example.com" });

/** Name of a company's calendar under the default template. */
export const cal = (company: string) => `40SAR ${company} Training Program`;
