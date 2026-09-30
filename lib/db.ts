import { neon } from "@neondatabase/serverless";

/** Tagged-template SQL client for Neon, e.g. sql`select * from events where id = ${id}`. */
export const sql = neon(process.env.DATABASE_URL!);
