import { cache } from "react";
import type { Settings } from "@trng/shared/model";
import { parseSettings } from "@trng/shared/settings";
import { sql } from "./db";

/** The current settings (stored row merged over defaults), read once per request. */
export const getSettings = cache(async (): Promise<Settings> => {
  const [row] = await sql`select value from settings where key = 'app'`;
  return parseSettings(row?.value ?? {});
});

/**
 * Validates and stores settings submitted from the Settings page.
 *
 * Args:
 *   input: The full settings object as edited.
 *
 * Returns:
 *   The stored, validated settings.
 *
 * Raises:
 *   Error: If a value is invalid (message is shown to the user).
 */
export async function saveSettings(input: Partial<Settings>): Promise<Settings> {
  const s = parseSettings(input);
  await sql`insert into settings (key, value) values ('app', ${JSON.stringify(s)}::jsonb)
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return s;
}
