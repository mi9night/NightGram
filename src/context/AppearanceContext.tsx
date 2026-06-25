"use client";

// =============================================================================
//  NightGram Web — Appearance context
//  Two independent axes:
//    · THEME   → background + card/surface colors + text
//    · ACCENT  → buttons, glow, hover, borders, gradients
//  Each has ~15 presets (night, midnight, royal, gold, sakura, ocean, forest,
//  crimson, amber, emerald, amoled, graphite, navy, mint, light).
//  Persisted to localStorage, applied live via CSS custom properties.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AccentId, AppearanceSettings, ThemeId } from "@/types";

/** Convert "#a855f7" → "168 85 247" (space-separated RGB channels). */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

// --------------------------------------------------------------------------
//  THEME — background gradient + glass tint + text colors
// --------------------------------------------------------------------------

export interface ThemeDef {
  id: ThemeId;
  label: string;
  emoji: string;
  /** body background-color */
  bgColor: string;
  /** body background-image (gradient glows) */
  bg: string;
  /** RGB tint used for glass surfaces: rgba(r,g,b,opacity) */
  glassR: number;
  glassG: number;
  glassB: number;
  /** main text color */
  text: string;
  /** muted text color */
  textMuted: string;
  isLight: boolean;
  /** swatch gradient for the mini-preview button */
  swatch: string;
}

export const THEMES: ThemeDef[] = [
  {
    id: "night", label: "Night", emoji: "🌃", bgColor: "#03020a",
    bg: "radial-gradient(circle at 15% 18%, rgba(139,92,246,0.28), transparent 42%), radial-gradient(circle at 85% 12%, rgba(236,72,153,0.18), transparent 40%), radial-gradient(circle at 50% 95%, rgba(99,102,241,0.22), transparent 48%)",
    glassR: 30, glassG: 23, glassB: 64, text: "#e8e6f5", textMuted: "rgba(232,230,245,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#1f1740,#070512)",
  },
  {
    id: "midnight", label: "Midnight", emoji: "🌌", bgColor: "#02040d",
    bg: "radial-gradient(circle at 20% 15%, rgba(59,130,246,0.22), transparent 45%), radial-gradient(circle at 80% 85%, rgba(99,102,241,0.2), transparent 45%)",
    glassR: 12, glassG: 20, glassB: 48, text: "#dfe7ff", textMuted: "rgba(223,231,255,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#0c1733,#02040d)",
  },
  {
    id: "royal", label: "Royal", emoji: "👑", bgColor: "#0a0414",
    bg: "radial-gradient(circle at 25% 20%, rgba(124,58,237,0.3), transparent 45%), radial-gradient(circle at 75% 80%, rgba(168,85,247,0.2), transparent 45%)",
    glassR: 36, glassG: 18, glassB: 70, text: "#ede6ff", textMuted: "rgba(237,230,255,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#2a1158,#0a0414)",
  },
  {
    id: "gold", label: "Gold", emoji: "✨", bgColor: "#0d0a02",
    bg: "radial-gradient(circle at 20% 20%, rgba(251,191,36,0.2), transparent 45%), radial-gradient(circle at 80% 75%, rgba(245,158,11,0.15), transparent 45%)",
    glassR: 40, glassG: 32, glassB: 12, text: "#fdf6e3", textMuted: "rgba(253,246,227,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#3a2f0e,#0d0a02)",
  },
  {
    id: "sakura", label: "Sakura", emoji: "🌸", bgColor: "#0f0410",
    bg: "radial-gradient(circle at 20% 20%, rgba(236,72,153,0.24), transparent 45%), radial-gradient(circle at 80% 80%, rgba(244,114,182,0.16), transparent 45%)",
    glassR: 48, glassG: 16, glassB: 40, text: "#ffe6f0", textMuted: "rgba(255,230,240,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#3d1130,#0f0410)",
  },
  {
    id: "ocean", label: "Ocean", emoji: "🌊", bgColor: "#020a12",
    bg: "radial-gradient(circle at 20% 20%, rgba(14,165,233,0.22), transparent 45%), radial-gradient(circle at 80% 80%, rgba(6,182,212,0.16), transparent 45%)",
    glassR: 10, glassG: 32, glassB: 50, text: "#e0f2fe", textMuted: "rgba(224,242,254,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#0b2740,#020a12)",
  },
  {
    id: "forest", label: "Forest", emoji: "🌲", bgColor: "#020e08",
    bg: "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.2), transparent 45%), radial-gradient(circle at 80% 80%, rgba(5,150,105,0.15), transparent 45%)",
    glassR: 10, glassG: 40, glassB: 28, text: "#dcfce7", textMuted: "rgba(220,252,231,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#0a2e1e,#020e08)",
  },
  {
    id: "crimson", label: "Crimson", emoji: "🔴", bgColor: "#100203",
    bg: "radial-gradient(circle at 20% 20%, rgba(239,68,68,0.22), transparent 45%), radial-gradient(circle at 80% 80%, rgba(220,38,38,0.16), transparent 45%)",
    glassR: 48, glassG: 12, glassB: 14, text: "#fee2e2", textMuted: "rgba(254,226,226,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#3a0b0d,#100203)",
  },
  {
    id: "amber", label: "Amber", emoji: "🔶", bgColor: "#100802",
    bg: "radial-gradient(circle at 20% 20%, rgba(245,158,11,0.22), transparent 45%), radial-gradient(circle at 80% 80%, rgba(251,146,60,0.15), transparent 45%)",
    glassR: 48, glassG: 28, glassB: 10, text: "#fff7ed", textMuted: "rgba(255,247,237,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#3a200a,#100802)",
  },
  {
    id: "emerald", label: "Emerald", emoji: "💚", bgColor: "#02100a",
    bg: "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.22), transparent 45%), radial-gradient(circle at 80% 80%, rgba(52,211,153,0.15), transparent 45%)",
    glassR: 8, glassG: 48, glassB: 34, text: "#d1fae5", textMuted: "rgba(209,250,229,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#0a3a26,#02100a)",
  },
  {
    id: "amoled", label: "AMOLED", emoji: "⚫", bgColor: "#000000",
    bg: "radial-gradient(circle at 50% 0%, rgba(40,40,50,0.5), transparent 50%)",
    glassR: 12, glassG: 12, glassB: 16, text: "#e8e6f5", textMuted: "rgba(232,230,245,0.5)", isLight: false,
    swatch: "linear-gradient(135deg,#1a1a22,#000000)",
  },
  {
    id: "graphite", label: "Graphite", emoji: "🖼️", bgColor: "#0a0a0c",
    bg: "radial-gradient(circle at 20% 20%, rgba(120,120,130,0.16), transparent 45%), radial-gradient(circle at 80% 80%, rgba(90,90,100,0.12), transparent 45%)",
    glassR: 28, glassG: 28, glassB: 32, text: "#e5e5ea", textMuted: "rgba(229,229,234,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#232328,#0a0a0c)",
  },
  {
    id: "navy", label: "Navy", emoji: "⚓", bgColor: "#02061a",
    bg: "radial-gradient(circle at 20% 20%, rgba(37,99,235,0.22), transparent 45%), radial-gradient(circle at 80% 80%, rgba(29,78,216,0.15), transparent 45%)",
    glassR: 12, glassG: 22, glassB: 56, text: "#dbe4ff", textMuted: "rgba(219,228,255,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#0e1d4d,#02061a)",
  },
  {
    id: "mint", label: "Mint", emoji: "🍃", bgColor: "#02100c",
    bg: "radial-gradient(circle at 20% 20%, rgba(52,211,153,0.2), transparent 45%), radial-gradient(circle at 80% 80%, rgba(110,231,183,0.14), transparent 45%)",
    glassR: 10, glassG: 44, glassB: 36, text: "#d3f5e7", textMuted: "rgba(211,245,231,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#0a3326,#02100c)",
  },
  {
    id: "void", label: "Void", emoji: "🕳️", bgColor: "#020106",
    bg: "radial-gradient(circle at 18% 18%, rgba(88,28,135,0.22), transparent 44%), radial-gradient(circle at 84% 78%, rgba(15,23,42,0.55), transparent 48%)",
    glassR: 12, glassG: 8, glassB: 24, text: "#f2edff", textMuted: "rgba(242,237,255,0.52)", isLight: false,
    swatch: "linear-gradient(135deg,#140820,#020106)",
  },
  {
    id: "obsidian", label: "Obsidian", emoji: "🖤", bgColor: "#030507",
    bg: "radial-gradient(circle at 20% 18%, rgba(100,116,139,0.16), transparent 42%), radial-gradient(circle at 80% 82%, rgba(30,41,59,0.26), transparent 45%)",
    glassR: 16, glassG: 20, glassB: 26, text: "#e7edf6", textMuted: "rgba(231,237,246,0.52)", isLight: false,
    swatch: "linear-gradient(135deg,#111827,#030507)",
  },
  {
    id: "plum", label: "Plum", emoji: "🍇", bgColor: "#100518",
    bg: "radial-gradient(circle at 22% 20%, rgba(192,38,211,0.22), transparent 45%), radial-gradient(circle at 84% 80%, rgba(107,33,168,0.2), transparent 45%)",
    glassR: 42, glassG: 18, glassB: 56, text: "#fae8ff", textMuted: "rgba(250,232,255,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#3b0f55,#100518)",
  },
  {
    id: "bloodmoon", label: "Blood Moon", emoji: "🩸", bgColor: "#0f0207",
    bg: "radial-gradient(circle at 20% 22%, rgba(220,38,38,0.24), transparent 44%), radial-gradient(circle at 76% 82%, rgba(190,24,93,0.16), transparent 45%)",
    glassR: 44, glassG: 10, glassB: 22, text: "#ffe4e6", textMuted: "rgba(255,228,230,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#4a0714,#0f0207)",
  },
  {
    id: "cyber", label: "Cyber", emoji: "👾", bgColor: "#020b12",
    bg: "radial-gradient(circle at 16% 18%, rgba(34,211,238,0.22), transparent 44%), radial-gradient(circle at 82% 78%, rgba(217,70,239,0.18), transparent 45%)",
    glassR: 8, glassG: 30, glassB: 46, text: "#e0fbff", textMuted: "rgba(224,251,255,0.54)", isLight: false,
    swatch: "linear-gradient(135deg,#062d39,#190928)",
  },
  {
    id: "aurora", label: "Aurora", emoji: "🌌", bgColor: "#03100f",
    bg: "radial-gradient(circle at 18% 18%, rgba(52,211,153,0.2), transparent 44%), radial-gradient(circle at 80% 22%, rgba(168,85,247,0.18), transparent 44%), radial-gradient(circle at 58% 90%, rgba(14,165,233,0.16), transparent 44%)",
    glassR: 8, glassG: 34, glassB: 36, text: "#e6fffb", textMuted: "rgba(230,255,251,0.54)", isLight: false,
    swatch: "linear-gradient(135deg,#07352f,#241354,#03100f)",
  },
  {
    id: "nebula", label: "Nebula", emoji: "🪐", bgColor: "#060316",
    bg: "radial-gradient(circle at 18% 18%, rgba(79,70,229,0.24), transparent 44%), radial-gradient(circle at 86% 74%, rgba(236,72,153,0.18), transparent 45%)",
    glassR: 20, glassG: 16, glassB: 52, text: "#ede9fe", textMuted: "rgba(237,233,254,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#1e1b4b,#500724,#060316)",
  },
  {
    id: "dracula", label: "Dracula", emoji: "🧛", bgColor: "#090815",
    bg: "radial-gradient(circle at 18% 18%, rgba(139,92,246,0.2), transparent 44%), radial-gradient(circle at 82% 82%, rgba(244,114,182,0.14), transparent 45%)",
    glassR: 28, glassG: 24, glassB: 48, text: "#f8f8f2", textMuted: "rgba(248,248,242,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#282a36,#090815)",
  },
  {
    id: "ice", label: "Ice", emoji: "❄️", bgColor: "#031018",
    bg: "radial-gradient(circle at 18% 18%, rgba(186,230,253,0.18), transparent 44%), radial-gradient(circle at 82% 82%, rgba(59,130,246,0.16), transparent 45%)",
    glassR: 12, glassG: 36, glassB: 52, text: "#eff6ff", textMuted: "rgba(239,246,255,0.56)", isLight: false,
    swatch: "linear-gradient(135deg,#0c4a6e,#031018)",
  },
  {
    id: "terminal", label: "Terminal", emoji: "💻", bgColor: "#010805",
    bg: "radial-gradient(circle at 20% 20%, rgba(34,197,94,0.17), transparent 45%), radial-gradient(circle at 80% 80%, rgba(20,184,166,0.1), transparent 45%)",
    glassR: 5, glassG: 28, glassB: 18, text: "#dcfce7", textMuted: "rgba(220,252,231,0.52)", isLight: false,
    swatch: "linear-gradient(135deg,#052e16,#010805)",
  },
  {
    id: "coffee", label: "Coffee", emoji: "☕", bgColor: "#100804",
    bg: "radial-gradient(circle at 20% 20%, rgba(180,83,9,0.18), transparent 45%), radial-gradient(circle at 80% 80%, rgba(120,53,15,0.16), transparent 45%)",
    glassR: 48, glassG: 28, glassB: 18, text: "#ffedd5", textMuted: "rgba(255,237,213,0.55)", isLight: false,
    swatch: "linear-gradient(135deg,#3f1f0c,#100804)",
  },
  {
    id: "cream", label: "Cream", emoji: "🍦", bgColor: "#f4efe6",
    bg: "radial-gradient(circle at 16% 16%, rgba(251,191,36,0.18), transparent 42%), radial-gradient(circle at 86% 86%, rgba(236,72,153,0.1), transparent 44%)",
    glassR: 255, glassG: 250, glassB: 240, text: "#211827", textMuted: "rgba(33,24,39,0.56)", isLight: true,
    swatch: "linear-gradient(135deg,#fff7ed,#eadcc8)",
  },
  {
    id: "light", label: "Light", emoji: "☀️", bgColor: "#eef0f8",
    bg: "radial-gradient(circle at 15% 15%, rgba(168,85,247,0.18), transparent 45%), radial-gradient(circle at 85% 85%, rgba(99,102,241,0.14), transparent 45%)",
    glassR: 255, glassG: 255, glassB: 255, text: "#1a1530", textMuted: "rgba(26,21,48,0.55)", isLight: true,
    swatch: "linear-gradient(135deg,#ffffff,#d8dcf0)",
  },
];

// --------------------------------------------------------------------------
//  ACCENT — highlight color (buttons, glow, hover, borders, gradients)
// --------------------------------------------------------------------------

export interface AccentDef {
  id: AccentId;
  label: string;
  emoji: string;
  main: string;
  secondary: string;
  tertiary: string;
}

export const ACCENTS: AccentDef[] = [
  { id: "night", label: "Night", emoji: "🌃", main: "#a855f7", secondary: "#8b5cf6", tertiary: "#ec4899" },
  { id: "midnight", label: "Midnight", emoji: "🌌", main: "#3b82f6", secondary: "#2563eb", tertiary: "#6366f1" },
  { id: "royal", label: "Royal", emoji: "👑", main: "#7c3aed", secondary: "#8b5cf6", tertiary: "#6366f1" },
  { id: "gold", label: "Gold", emoji: "✨", main: "#fbbf24", secondary: "#f59e0b", tertiary: "#f97316" },
  { id: "sakura", label: "Sakura", emoji: "🌸", main: "#ec4899", secondary: "#db2777", tertiary: "#f472b6" },
  { id: "ocean", label: "Ocean", emoji: "🌊", main: "#0ea5e9", secondary: "#0284c7", tertiary: "#06b6d4" },
  { id: "forest", label: "Forest", emoji: "🌲", main: "#10b981", secondary: "#059669", tertiary: "#34d399" },
  { id: "crimson", label: "Crimson", emoji: "🔴", main: "#ef4444", secondary: "#dc2626", tertiary: "#f87171" },
  { id: "amber", label: "Amber", emoji: "🔶", main: "#f59e0b", secondary: "#d97706", tertiary: "#fbbf24" },
  { id: "emerald", label: "Emerald", emoji: "💚", main: "#10b981", secondary: "#059669", tertiary: "#6ee7b7" },
  { id: "amoled", label: "AMOLED", emoji: "⚫", main: "#a855f7", secondary: "#8b5cf6", tertiary: "#c084fc" },
  { id: "graphite", label: "Graphite", emoji: "🖼️", main: "#9ca3af", secondary: "#6b7280", tertiary: "#d1d5db" },
  { id: "navy", label: "Navy", emoji: "⚓", main: "#2563eb", secondary: "#1d4ed8", tertiary: "#3b82f6" },
  { id: "mint", label: "Mint", emoji: "🍃", main: "#34d399", secondary: "#10b981", tertiary: "#6ee7b7" },
  { id: "void", label: "Void", emoji: "🕳️", main: "#7c3aed", secondary: "#4c1d95", tertiary: "#c084fc" },
  { id: "obsidian", label: "Obsidian", emoji: "🖤", main: "#64748b", secondary: "#334155", tertiary: "#94a3b8" },
  { id: "plum", label: "Plum", emoji: "🍇", main: "#c026d3", secondary: "#9333ea", tertiary: "#e879f9" },
  { id: "bloodmoon", label: "Blood Moon", emoji: "🩸", main: "#be123c", secondary: "#dc2626", tertiary: "#fb7185" },
  { id: "cyber", label: "Cyber", emoji: "👾", main: "#00f5d4", secondary: "#22d3ee", tertiary: "#d946ef" },
  { id: "aurora", label: "Aurora", emoji: "🌌", main: "#2dd4bf", secondary: "#8b5cf6", tertiary: "#38bdf8" },
  { id: "nebula", label: "Nebula", emoji: "🪐", main: "#6366f1", secondary: "#a855f7", tertiary: "#ec4899" },
  { id: "dracula", label: "Dracula", emoji: "🧛", main: "#bd93f9", secondary: "#ff79c6", tertiary: "#8be9fd" },
  { id: "ice", label: "Ice", emoji: "❄️", main: "#7dd3fc", secondary: "#38bdf8", tertiary: "#bae6fd" },
  { id: "terminal", label: "Terminal", emoji: "💻", main: "#22c55e", secondary: "#16a34a", tertiary: "#14b8a6" },
  { id: "coffee", label: "Coffee", emoji: "☕", main: "#b45309", secondary: "#92400e", tertiary: "#f59e0b" },
  { id: "cream", label: "Cream", emoji: "🍦", main: "#d97706", secondary: "#db2777", tertiary: "#8b5cf6" },
  { id: "light", label: "Light", emoji: "☀️", main: "#8b5cf6", secondary: "#a855f7", tertiary: "#6366f1" },
];

const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "night",
  accent: "night",
  glassOpacity: 0.45,
  reducedMotion: false,
  fontSize: "base",
};

interface AppearanceContextValue {
  settings: AppearanceSettings;
  theme: ThemeDef;
  accent: AccentDef;
  setTheme: (t: ThemeId) => void;
  setAccent: (a: AccentId) => void;
  setGlassOpacity: (n: number) => void;
  setReducedMotion: (v: boolean) => void;
  setFontSize: (s: AppearanceSettings["fontSize"]) => void;
  reset: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);
const STORAGE_KEY = "ng_appearance";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULT_APPEARANCE, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  // Apply to DOM whenever settings change
  useEffect(() => {
    const theme = THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];
    const accent = ACCENTS.find((a) => a.id === settings.accent) ?? ACCENTS[0];
    const root = document.documentElement;

    // Accent — hex + RGB channels (RGB channels power Tailwind opacity modifiers)
    root.style.setProperty("--accent-main", accent.main);
    root.style.setProperty("--accent-main-rgb", hexToRgb(accent.main));
    root.style.setProperty("--accent-secondary", accent.secondary);
    root.style.setProperty("--accent-secondary-rgb", hexToRgb(accent.secondary));
    root.style.setProperty("--accent-tertiary", accent.tertiary);
    root.style.setProperty("--accent-tertiary-rgb", hexToRgb(accent.tertiary));
    root.style.setProperty("--accent-pink", accent.tertiary);

    // Theme — background + surfaces + text
    root.style.setProperty("--bg-color", theme.bgColor);
    root.style.setProperty("--bg-image", theme.bg);
    root.style.setProperty("--glass-r", String(theme.glassR));
    root.style.setProperty("--glass-g", String(theme.glassG));
    root.style.setProperty("--glass-b", String(theme.glassB));
    root.style.setProperty("--c-text", theme.text);
    root.style.setProperty("--c-text-muted", theme.textMuted);
    root.style.setProperty("--glass-opacity", String(settings.glassOpacity));

    // font size
    const sizeMap = { sm: "14px", base: "16px", lg: "18px" };
    root.style.fontSize = sizeMap[settings.fontSize];

    // light/dark flag for utility overrides
    root.classList.toggle("ng-light", theme.isLight);
    root.classList.toggle("ng-reduced-motion", settings.reducedMotion);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const setTheme = useCallback((theme: ThemeId) => setSettings((s) => ({ ...s, theme })), []);
  const setAccent = useCallback((accent: AccentId) => setSettings((s) => ({ ...s, accent })), []);
  const setGlassOpacity = useCallback((glassOpacity: number) => setSettings((s) => ({ ...s, glassOpacity })), []);
  const setReducedMotion = useCallback((reducedMotion: boolean) => setSettings((s) => ({ ...s, reducedMotion })), []);
  const setFontSize = useCallback((fontSize: AppearanceSettings["fontSize"]) => setSettings((s) => ({ ...s, fontSize })), []);
  const reset = useCallback(() => setSettings(DEFAULT_APPEARANCE), []);

  const theme = THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];
  const accent = ACCENTS.find((a) => a.id === settings.accent) ?? ACCENTS[0];

  const value = useMemo<AppearanceContextValue>(
    () => ({ settings, theme, accent, setTheme, setAccent, setGlassOpacity, setReducedMotion, setFontSize, reset }),
    [settings, theme, accent, setTheme, setAccent, setGlassOpacity, setReducedMotion, setFontSize, reset],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within <AppearanceProvider>");
  return ctx;
}
