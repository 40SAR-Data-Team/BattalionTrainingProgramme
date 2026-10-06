import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against `next dev` on port 3100, backed by the fake Neon (fresh in-memory
 * database seeded with the dummy programme) and the fake Google / OpenAI servers. Nothing touches real services.
 * Stop any other `next dev` in frontend/ first: two dev servers can't share frontend/.next.
 */
const env = {
  DATABASE_URL: "postgresql://fake:fake@fake-neon.local/fake", // FAKE_DATABASE_URL; any valid URL works
  NEON_FETCH_ENDPOINT: "http://localhost:4012/sql",
  ADMIN_KEY: "e2e-admin-key",
  ACCESS_KEY: "e2e-access-key",
  OPENAI_API_KEY: "sk-fake",
  GOOGLE_API_ROOT: "http://localhost:4010/",
  OPENAI_BASE_URL: "http://localhost:4011",
  GOOGLE_SERVICE_ACCOUNT_KEY: "",
};

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts", // not *.spec.ts: bare `bun test` would pick those up and fail
  fullyParallel: false,
  workers: 1, // one shared database; tests run in file order
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    { command: "bun fakes/serve.ts", port: 4012, reuseExistingServer: false },
    {
      command: "bun run --cwd ../frontend dev --port 3100",
      url: "http://localhost:3100/login",
      env,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
