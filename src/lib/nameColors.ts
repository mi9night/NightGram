// =============================================================================
//  NightGram Web — Name color presets
//  Old unique colors are preserved; duplicates are removed; new colors are added.
//  This palette is independent from app accent colors.
// =============================================================================

export interface NameColorPreset {
  id: string;
  label: string;
  emoji: string;
  color: string;
  glow?: string;
}

export const NAME_COLORS: NameColorPreset[] = [
  // Free/default identity color. Keep id="light" for backward compatibility with old default rows.
  { id: "light", label: "Moon", emoji: "🌙", color: "#ffffff" },

  // Old unique accent-derived colors kept exactly, excluding duplicate colors.
  { id: "night", label: "Night", emoji: "🌃", color: "#a855f7" },
  { id: "midnight", label: "Midnight", emoji: "🌌", color: "#3b82f6" },
  { id: "royal", label: "Royal", emoji: "👑", color: "#7c3aed" },
  { id: "gold", label: "Gold", emoji: "✨", color: "#fbbf24" },
  { id: "sakura", label: "Sakura", emoji: "🌸", color: "#ec4899" },
  { id: "ocean", label: "Ocean", emoji: "🌊", color: "#0ea5e9" },
  { id: "forest", label: "Forest", emoji: "🌲", color: "#10b981" },
  { id: "crimson", label: "Crimson", emoji: "🔴", color: "#ef4444" },
  { id: "amber", label: "Amber", emoji: "🔶", color: "#f59e0b" },
  { id: "graphite", label: "Graphite", emoji: "🖼️", color: "#9ca3af" },
  { id: "navy", label: "Navy", emoji: "⚓", color: "#2563eb" },
  { id: "mint", label: "Mint", emoji: "🍃", color: "#34d399" },
  { id: "light_violet", label: "Light Violet", emoji: "☀️", color: "#8b5cf6" },

  // New varied identity colors.
  { id: "ultra_purple", label: "Ultra", emoji: "🔮", color: "#6d28d9" },
  { id: "neon_pink", label: "Neon Pink", emoji: "💗", color: "#ff4ecd" },
  { id: "rose", label: "Rose", emoji: "🌹", color: "#fb7185" },
  { id: "sunset", label: "Sunset", emoji: "🌇", color: "#f97316" },
  { id: "lemon", label: "Lemon", emoji: "🍋", color: "#fde047" },
  { id: "lime", label: "Lime", emoji: "🧪", color: "#a3e635" },
  { id: "teal", label: "Teal", emoji: "🫧", color: "#2dd4bf" },
  { id: "cyan", label: "Cyan", emoji: "💎", color: "#22d3ee" },
  { id: "sky", label: "Sky", emoji: "☁️", color: "#38bdf8" },
  { id: "blue", label: "Blue", emoji: "🔵", color: "#60a5fa" },
  { id: "indigo", label: "Indigo", emoji: "🌀", color: "#818cf8" },
  { id: "periwinkle", label: "Peri", emoji: "🪻", color: "#c4b5fd" },
  { id: "lavender", label: "Lavender", emoji: "💟", color: "#e879f9" },
  { id: "magenta", label: "Magenta", emoji: "🎀", color: "#f472b6" },
  { id: "coral", label: "Coral", emoji: "🪸", color: "#ff7f50" },
  { id: "peach", label: "Peach", emoji: "🍑", color: "#fdba74" },
  { id: "copper", label: "Copper", emoji: "🟠", color: "#d97706" },
  { id: "silver", label: "Silver", emoji: "🪙", color: "#cbd5e1" },
  { id: "ice", label: "Ice", emoji: "❄️", color: "#bae6fd" },
  { id: "toxic", label: "Toxic", emoji: "☣️", color: "#84cc16" },
  { id: "cyber", label: "Cyber", emoji: "👾", color: "#00f5d4" },
  { id: "nova", label: "Nova", emoji: "⭐", color: "#f0abfc" },
];

/** The default (free) name color — always available without Premium. */
export const FREE_NAME_COLOR = "#ffffff";
export const FREE_NAME_COLOR_ID = "light";
