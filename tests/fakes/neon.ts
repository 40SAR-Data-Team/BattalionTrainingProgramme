/**
 * Fake Neon: answers the Neon serverless driver's HTTP query protocol from an in-memory PGlite.
 * The app reaches it through NEON_FETCH_ENDPOINT, so production code runs unchanged (Neon driver, Neon type parsing).
 */
import { PGlite } from "@electric-sql/pglite";

const DATABASE_DIR = `${import.meta.dir}/../../database`;

/**
 * In-memory Postgres behind `POST /sql` with the Neon wire format: `{query, params}` in,
 * `{fields: [{name, dataTypeID}], rows: [[text, …]]}` out, errors as HTTP 400 `{message, code}`.
 *
 * Attributes:
 *   db: the PGlite database, for direct inspection in tests.
 */
export class FakeNeon {
  db = new PGlite();
  private seeding: Promise<void> = Promise.resolve();

  /** Loads database/schema.sql and the dummy programme in database/seed.sql; queries wait until it finishes. */
  seed(): Promise<void> {
    this.seeding = (async () => {
      await this.db.exec(await Bun.file(`${DATABASE_DIR}/schema.sql`).text());
      await this.db.exec(await Bun.file(`${DATABASE_DIR}/seed.sql`).text());
    })();
    return this.seeding;
  }

  /**
   * Handles one HTTP request from the Neon driver.
   *
   * Args:
   *   req: the driver's POST with a JSON `{query, params}` body.
   *
   * Returns:
   *   The result as raw Postgres text (the driver parses it), or 400 with the Postgres error.
   */
  async handle(req: Request): Promise<Response> {
    await this.seeding;
    const { query, params } = (await req.json()) as { query: string; params: unknown[] };
    // Identity parser for every known type: PGlite returns raw text, as Neon does.
    const raw = Object.fromEntries(Object.keys(this.db.parsers).map((oid) => [oid, (text: string) => text]));
    try {
      const r = await this.db.query(query, params, { rowMode: "array", parsers: raw });
      return Response.json({ fields: r.fields, rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });
    } catch (e) {
      const err = e as { message: string; code?: string };
      return Response.json({ message: err.message, code: err.code }, { status: 400 });
    }
  }
}
