/** One column of the period grid, e.g. {key: "1", label: "1", start: "07:00", end: "07:50"} (Singapore time). */
export type Period = { key: string; label: string; start: string; end: string };

/** A company tab. Each maps to its own Google Calendar. `color` is a CSS hex colour. */
export type Company = { name: string; color: string };

/** An event category from the source programme's colour legend.
 *
 * Attributes:
 *   color: Card colour in the app (CSS hex).
 *   googleColorId: Google Calendar event colour id ("1".."11").
 *   legend: Cell colour on the paper programme, told to the AI (e.g. "green").
 */
export type Category = { name: string; color: string; googleColorId: string; legend: string };

/** OpenAI reasoning effort levels offered in Settings. */
export const EFFORTS = ["minimal", "low", "medium", "high"] as const;

/** Every user-adjustable setting (secrets excluded). Stored as one JSON row; see `shared/settings.ts` for defaults. */
export type Settings = {
  unitName: string;
  /** Calendar name; `{unit}` and `{company}` are replaced. */
  calendarName: string;
  /** Google account that gets owner access to calendars the app creates. */
  calendarOwner: string;
  companies: Company[];
  categories: Category[];
  periods: Period[];
  aiModel: string;
  aiEffort: (typeof EFFORTS)[number];
  upcomingDays: number;
  lookbackDays: number;
  photoMaxPx: number;
  sessionDays: number;
};

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
