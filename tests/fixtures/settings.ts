import type { PaletteEntry, SettingsResponse } from "../../src/api/client";

// The orchestrator's default palette. `sleep` holds colour 8 from P1B-54; `location`, which held it, is retired.
export function settingsFixture(overrides: Partial<Record<string, { color_id: string; origin: PaletteEntry["origin"] }>> = {}): SettingsResponse {
  const palette: PaletteEntry[] = Object.entries({ personal: "3", relationship: "5", business: "6", committed: "11", sleep: "8", entertainment: "1", grocery: "2", commute: "7", undefined: "4", education_house: "10", work: "9" })
    .map(([category, color_id]) => ({ category, color_id, origin: "default", ...overrides[category] }));
  return {
    schema_version: "ubu.orchestrator.setting.v1",
    settings: palette.filter((entry) => entry.origin === "setting").map((entry) => ({ id: `setting_synthetic_${entry.category}`, name: `calendar.color.${entry.category}`, value: entry.color_id, authority_source: "user", version: 1 })),
    palette,
    inverse: Array.from({ length: 11 }, (_, index) => {
      const color_id = String(index + 1);
      const categories = palette.filter((entry) => entry.color_id === color_id).map((entry) => entry.category).sort();
      return { color_id, categories, status: categories.length === 0 ? "unmapped" : categories.length === 1 ? "mapped" : "collision" };
    })
  };
}
