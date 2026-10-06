import { neon, neonConfig, Pool } from "@neondatabase/serverless";

/** Tagged-template SQL that resolves to the result rows, e.g. sql`select * from events where id = ${id}`. */
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, any>[]>; // eslint-disable-line @typescript-eslint/no-explicit-any

const url = () => process.env.DATABASE_URL ?? "";
let neonSql: Sql | null = null;

/** SQL client for DATABASE_URL (Neon). Opened on first use. */
export const sql: Sql = (strings, ...values) => {
  if (!neonSql) {
    // Env-only test seam, like GOOGLE_API_ROOT: tests point the driver at a fake Neon (tests/fakes/neon.ts).
    if (process.env.NEON_FETCH_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
    neonSql = neon(url()) as unknown as Sql;
  }
  return neonSql(strings, ...values);
};

/**
 * Runs a multi-statement SQL script (schema, seed data) with no parameters.
 *
 * Args:
 *   script: SQL text, statements separated by semicolons.
 *   connectionString: Database to run it on; defaults to DATABASE_URL.
 */
export async function runScript(script: string, connectionString = url()): Promise<void> {
  const pool = new Pool({ connectionString });
  try { await pool.query(script); } finally { await pool.end(); }
}
