import { expect, test } from "bun:test";
import { calendarName, DEFAULT_SETTINGS, parseSettings } from "@trng/shared/common/settings";

// Use case: an admin edits settings; bad input is rejected with a message they can act on.

test("an empty settings row behaves exactly like the factory defaults", () => {
  expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
});

test("saved values override defaults, missing ones fall back", () => {
  const s = parseSettings({ unitName: "41SAR", upcomingDays: 14 });
  expect(s.unitName).toBe("41SAR");
  expect(s.upcomingDays).toBe(14);
  expect(s.companies).toEqual(DEFAULT_SETTINGS.companies);
});

test("calendar names follow the template", () => {
  expect(calendarName(DEFAULT_SETTINGS, "Archer")).toBe("40SAR Archer Training Program");
  expect(calendarName({ unitName: "41SAR", calendarName: "{company} - {unit}" }, "Braves")).toBe("Braves - 41SAR");
});

test.each([
  [{ companies: [] }, "Add at least one company"],
  [{ companies: [{ name: "Archer", color: "#ffffff" }, { name: "archer", color: "#ffffff" }] }, "same name"],
  [{ companies: [{ name: "Archer", color: "red" }] }, "#RRGGBB"],
  [{ calendarName: "Training" }, "{company}"],
  [{ periods: [{ key: "1", label: "1", start: "08:00", end: "07:00" }] }, "end must be after start"],
  [{ periods: [{ key: "1", label: "1", start: "07:00", end: "08:00" }, { key: "2", label: "2", start: "07:30", end: "09:00" }] }, "overlaps"],
  [{ periods: [{ key: "1", label: "1", start: "7am", end: "08:00" }] }, "HH:MM"],
  [{ upcomingDays: 0 }, "positive whole number"],
  [{ aiEffort: "max" as never }, "Reasoning effort"],
  [{ categories: [{ name: "X", color: "#ffffff", googleColorId: "12", legend: "" }] }, "Google colour"],
])("rejects invalid settings %#", (input, message) => {
  expect(() => parseSettings(input)).toThrow(message);
});
