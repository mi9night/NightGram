// =============================================================================
//  NightGram Web — Name color presets
//  Derived from the theme presets so username colors match the palette.
//  Duplicate colors are de-duplicated (forest/emerald, night/amoled) so only
//  ONE swatch can ever be active. Tracked by id, not by color value.
//  These are a Premium-only feature.
// =============================================================================

import { ACCENTS } from "@/context/AppearanceContext";

export interface NameColorPreset {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

/** Name-color presets — same palette as themes, with duplicate colors removed. */
export const NAME_COLORS: NameColorPreset[] = (() => {
  const seen = new Set<string>();
  const out: NameColorPreset[] = [];
  for (const a of ACCENTS) {
    if (seen.has(a.main.toLowerCase())) continue; // skip duplicate color
    seen.add(a.main.toLowerCase());
    out.push({ id: a.id, label: a.label, emoji: a.emoji, color: a.main });
  }
  return out;
})();

/** The default (free) name color — always available without Premium. */
export const FREE_NAME_COLOR = "#ffffff";
export const FREE_NAME_COLOR_ID = "light";
