import { neon } from "@neondatabase/serverless";

/** Tagged-template SQL client for Neon, e.g. sql`select * from events where id = ${id}`. */
export const sql = neon(process.env.DATABASE_URL!);

/** Company tabs, in display order. Each maps to calendar "40SAR <Company> Training Program". */
export const COMPANIES = ["Archer", "Braves", "Cougar", "Stallion", "Hercules"] as const;

/** Event categories, taken from the colour legend on the source training programme. */
export const CATEGORIES = ["Outfield", "External Training", "Physical Training", "Live Firing/HRA", "Off/Leave/Weekend"] as const;

/**
 * A training event as stored in the `events` table.
 *
 * Attributes:
 *   id: Row uuid; also written to each Google copy as extendedProperties.private.trngEventId.
 *   start_at / end_at: ISO timestamps. For all-day events end_at is the last day (inclusive).
 *   google: Per-company Google copy, {Company: {id, etag}}.
 */
export type Event = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  cond: string | null;
  loc: string | null;
  resrc: string | null;
  comments: string | null;
  category: string | null;
  companies: string[];
  google: Record<string, { id: string; etag: string }>;
  attrs: Record<string, unknown>;
};
