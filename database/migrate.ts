/**
 * Applies database/schema.sql as the database owner: DATABASE_OWNER_URL if set, else DATABASE_URL.
 * The app's own role (trngprgm_app) can't change the schema, so migrations need the owner.
 * Usage: bun --env-file=frontend/.env.local database/migrate.ts
 */
import { runScript } from "../backend/db.ts";

await runScript(await Bun.file(`${import.meta.dir}/schema.sql`).text(), process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL);
console.log("Schema applied.");
