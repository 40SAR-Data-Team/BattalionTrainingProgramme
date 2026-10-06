/** Company tabs, in display order. Each maps to calendar "40SAR <Company> Training Program". */
export const COMPANIES = ["Archer", "Braves", "Cougar", "Stallion", "Hercules"] as const;

/** Event categories, taken from the colour legend on the source training programme. */
export const CATEGORIES = ["Outfield", "External Training", "Physical Training", "Live Firing/HRA", "Off/Leave/Weekend"] as const;

/** A row of the `events` table. id doubles as Google's trngEventId tag; all-day end_at is the last day (inclusive);
 * google holds each company's copy as {Company: {id, etag}}. */
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
