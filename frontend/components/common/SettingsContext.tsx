"use client";
import { createContext, useContext } from "react";
import type { Settings } from "@trng/shared/common/model";

// No default value: importing DEFAULT_SETTINGS here would put the unit's companies and grid in public JS.
const Ctx = createContext<Settings | null>(null);

/** Provides the server-loaded settings (no secrets) to client components. Only rendered for signed-in users. */
export const SettingsProvider = Ctx.Provider;

/** Current settings: companies, categories, period grid, windows. Throws outside a SettingsProvider. */
export function useSettings(): Settings {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSettings needs a signed-in SettingsProvider");
  return s;
}

/** Black or white, whichever reads better on a #RRGGBB background. */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1d1d1f" : "#ffffff";
}
