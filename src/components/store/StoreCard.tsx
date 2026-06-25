"use client";

// =============================================================================
//  Магазин — item card (glass, preview, rarity glow, buy action)
// =============================================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Crown, Sparkles, Lock, Wand2, RotateCcw, Clock3, PackageCheck, Gift, Search, X, Gem, Palette, Hash, Box } from "lucide-react";
import type { StoreItem, ThemeId } from "@/types";
import { cn, formatCoins } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { pushGlobalToast } from "@/lib/toast";
import { useAppearance } from "@/context/AppearanceContext";
import { GlowAvatar } from "@/components/shared/GlowAvatar";

const RARITY = {
  common: { color: "#9ca3af", label: "Common", glow: "0 0 12px rgba(156,163,175,0.4)" },
  rare: { color: "#22d3ee", label: "Rare", glow: "0 0 16px rgba(34,211,238,0.5)" },
  epic: { color: "#a855f7", label: "Epic", glow: "0 0 18px rgba(168,85,247,0.6)" },
  legendary: { color: "#fbbf24", label: "Legendary", glow: "0 0 22px rgba(251,191,36,0.65)" },
};

const CATEGORY_GRADIENTS: Record<StoreItem["category"], string> = {
  theme: "linear-gradient(135deg,#a855f7,#ec4899)",
  color_pack: "linear-gradient(135deg,#fbbf24,#ec4899)",
  sticker_pack: "linear-gradient(135deg,#22d3ee,#6366f1)",
  frame: "linear-gradient(135deg,#a855f7,#6366f1)",
  glow_effect: "linear-gradient(135deg,#ec4899,#a855f7)",
  badge: "linear-gradient(135deg,#fbbf24,#a855f7)",
  nft: "linear-gradient(135deg,#00f5d4,#a855f7,#fbbf24)",
};

function themeFromItem(item: StoreItem): ThemeId {
  const text = `${item.name} ${item.description}`.toLowerCase();
  if (/gold|золот|sun/.test(text)) return "gold";
  if (/sakura|pink|rose|роз/.test(text)) return "sakura";
  if (/ocean|cyan|blue|sea|океан|голуб/.test(text)) return "ocean";
  if (/forest|green|emerald|лес|зел/.test(text)) return "forest";
  if (/crimson|red|blood|красн/.test(text)) return "crimson";
  if (/amber|orange|огонь/.test(text)) return "amber";
  if (/amoled|void|black|чёрн|черн/.test(text)) return "amoled";
  if (/graphite|gray|сер/.test(text)) return "graphite";
  if (/navy|marine/.test(text)) return "navy";
  if (/mint/.test(text)) return "mint";
  if (/royal|корол|crown/.test(text)) return "royal";
  return item.rarity === "legendary" ? "royal" : item.rarity === "rare" ? "midnight" : "night";
}


function isDisplayablePreviewUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.trim();
  if (!clean || clean.startsWith("#")) return false;
  return /^(https?:\/\/|\/|data:image\/|data:video\/|blob:)/i.test(clean);
}

type StoreEffectPreview = {
  mode: "theme" | "accent" | "name_color" | "avatar_frame" | "profile_background" | "glow_effect" | "badge" | "sticker_pack" | "generic";
  label: string;
  description: string;
  colors: string[];
  background: string;
  frameCss?: string;
};

const EFFECT_COLOR_MAP: Record<string, string[]> = {
  night: ["#a855f7", "#8b5cf6", "#ec4899"],
  midnight: ["#3b82f6", "#2563eb", "#6366f1"],
  royal: ["#7c3aed", "#8b5cf6", "#6366f1"],
  gold: ["#fbbf24", "#f59e0b", "#f97316"],
  sakura: ["#ec4899", "#db2777", "#f472b6"],
  ocean: ["#0ea5e9", "#0284c7", "#06b6d4"],
  forest: ["#10b981", "#059669", "#34d399"],
  crimson: ["#ef4444", "#dc2626", "#f87171"],
  amber: ["#f59e0b", "#d97706", "#fbbf24"],
  emerald: ["#10b981", "#059669", "#6ee7b7"],
  amoled: ["#000000", "#a855f7", "#c084fc"],
  graphite: ["#9ca3af", "#6b7280", "#d1d5db"],
  navy: ["#2563eb", "#1d4ed8", "#3b82f6"],
  mint: ["#34d399", "#10b981", "#6ee7b7"],
  void: ["#111827", "#7c3aed", "#c084fc"],
  obsidian: ["#64748b", "#334155", "#94a3b8"],
  plum: ["#c026d3", "#9333ea", "#e879f9"],
  bloodmoon: ["#be123c", "#dc2626", "#fb7185"],
  cyber: ["#00f5d4", "#22d3ee", "#d946ef"],
  aurora: ["#2dd4bf", "#8b5cf6", "#38bdf8"],
  nebula: ["#6366f1", "#a855f7", "#ec4899"],
  dracula: ["#bd93f9", "#ff79c6", "#8be9fd"],
  ice: ["#7dd3fc", "#38bdf8", "#bae6fd"],
  terminal: ["#22c55e", "#16a34a", "#14b8a6"],
  coffee: ["#b45309", "#92400e", "#f59e0b"],
  cream: ["#f4efe6", "#d97706", "#db2777"],
  purple: ["#a855f7", "#8b5cf6", "#ec4899"],
  pink: ["#ec4899", "#f472b6", "#ff4ecd"],
  cyan: ["#22d3ee", "#0ea5e9", "#67e8f9"],
};

function uniqColors(colors: string[]): string[] {
  const seen = new Set<string>();
  return colors
    .map((color) => color.trim())
    .filter((color) => /^#[0-9a-f]{6}$/i.test(color))
    .map((color) => color.toLowerCase())
    .filter((color) => {
      if (seen.has(color)) return false;
      seen.add(color);
      return true;
    });
}

function payloadColors(payload?: Record<string, unknown> | null): string[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = payload.previewColors ?? payload.colors ?? payload.nftColors ?? payload.backgroundColors;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\n,]+/) : [];
  return uniqColors(list.map((item) => String(item)));
}

function colorsFromText(...parts: Array<string | null | undefined>): string[] {
  return uniqColors(parts.flatMap((part) => String(part || "").match(/#[0-9a-f]{6}/gi) ?? []));
}

function frameColors(value?: string | null): string[] {
  const token = String(value || "").toLowerCase();
  if (token.startsWith("dual:")) return uniqColors(token.split(":").slice(1));
  if (token.startsWith("solid:")) return uniqColors([token.slice("solid:".length)]);
  if (token === "rainbow") return ["#ef4444", "#f97316", "#facc15", "#22c55e", "#06b6d4", "#6366f1", "#ec4899"];
  if (token === "premium") return ["#fbbf24", "#f59e0b", "#fff7ad"];
  if (token === "verified") return ["#38bdf8", "#2563eb", "#22d3ee"];
  if (token === "gradient" || token === "aurora") return ["#a855f7", "#ec4899", "#22d3ee"];
  if (token === "ice") return ["#bae6fd", "#60a5fa", "#22d3ee"];
  if (token === "fire") return ["#ef4444", "#f97316", "#fbbf24"];
  if (token === "cosmic") return ["#020617", "#4c1d95", "#ec4899", "#38bdf8"];
  return [];
}

function gradientFromColors(colors: string[], fallback: string): string {
  const palette = colors.length > 0 ? colors : [fallback, "#090512", fallback];
  return `radial-gradient(circle at 18% 18%, ${palette[0]}66, transparent 34%), radial-gradient(circle at 84% 74%, ${(palette[1] || palette[0])}66, transparent 38%), linear-gradient(135deg, #05020d 0%, ${palette[0]}55 46%, ${(palette[2] || palette[1] || palette[0])}55 100%)`;
}

function getStoreEffectPreview(item: StoreItem): StoreEffectPreview | null {
  const effectType = item.effectType || item.category;
  const payload = item.effectPayload && typeof item.effectPayload === "object" ? item.effectPayload : {};
  const value = item.effectValue || "";
  const mapped = EFFECT_COLOR_MAP[String(value).toLowerCase()] || [];
  const colors = uniqColors([
    ...payloadColors(payload),
    ...colorsFromText(value, item.previewUrl, item.name, item.description),
    ...mapped,
  ]);
  const primary = colors[0] || RARITY[item.rarity].color;

  if (effectType === "name_color") {
    const nameColor = colorsFromText(value, item.previewUrl)[0] || primary;
    return {
      mode: "name_color",
      label: "Цвет имени",
      description: nameColor.toUpperCase(),
      colors: [nameColor],
      background: gradientFromColors([nameColor, "#090512", nameColor], nameColor),
    };
  }

  if (effectType === "avatar_frame") {
    const framePalette = uniqColors([...payloadColors(payload), ...frameColors(value), ...colors]);
    const frameCss = value?.startsWith("dual:") || value?.startsWith("solid:") || ["rainbow", "gradient", "premium", "verified", "aurora", "ice", "fire", "cosmic"].includes(String(value))
      ? (framePalette.length > 1 ? `conic-gradient(from 0deg, ${framePalette.join(", ")}, ${framePalette[0]})` : `linear-gradient(135deg, ${framePalette[0] || primary}, ${primary})`)
      : undefined;
    return {
      mode: "avatar_frame",
      label: "Рамка аватара",
      description: framePalette.slice(0, 3).map((color) => color.toUpperCase()).join(" / ") || "готовый пресет",
      colors: framePalette.length ? framePalette : [primary],
      background: gradientFromColors(framePalette, primary),
      frameCss,
    };
  }

  if (effectType === "theme") {
    return {
      mode: "theme",
      label: "Тема сайта",
      description: colors.slice(0, 3).map((color) => color.toUpperCase()).join(" / ") || String(value || "theme"),
      colors: colors.length ? colors : [primary],
      background: gradientFromColors(colors, primary),
    };
  }

  if (effectType === "accent") {
    return {
      mode: "accent",
      label: "Акцент сайта",
      description: colors.slice(0, 3).map((color) => color.toUpperCase()).join(" / ") || String(value || "accent"),
      colors: colors.length ? colors : [primary],
      background: gradientFromColors(colors, primary),
    };
  }

  if (effectType === "profile_background") {
    return {
      mode: "profile_background",
      label: "Фон профиля",
      description: colors.slice(0, 3).map((color) => color.toUpperCase()).join(" / ") || "preview background",
      colors: colors.length ? colors : [primary],
      background: gradientFromColors(colors, primary),
    };
  }

  if (effectType === "glow_effect") {
    const glowColors = colors.length ? colors : (EFFECT_COLOR_MAP[String(value).toLowerCase()] || [primary, "#ffffff"]);
    return {
      mode: "glow_effect",
      label: "Glow эффект",
      description: glowColors[0]?.toUpperCase() || "glow",
      colors: glowColors,
      background: `radial-gradient(circle at 50% 38%, ${glowColors[0]}aa, transparent 26%), ${gradientFromColors(glowColors, glowColors[0] || primary)}`,
    };
  }

  if (effectType === "badge") {
    const badgeColors = colors.length ? colors : ["#fbbf24", "#a855f7"];
    return {
      mode: "badge",
      label: "Бейдж",
      description: badgeColors.slice(0, 2).map((color) => color.toUpperCase()).join(" / "),
      colors: badgeColors,
      background: gradientFromColors(badgeColors, badgeColors[0]),
    };
  }

  if (effectType === "sticker_pack") {
    return {
      mode: "sticker_pack",
      label: "Стикер-пак",
      description: "эмоции и стикеры",
      colors: colors.length ? colors : [primary, "#22d3ee"],
      background: gradientFromColors(colors, primary),
    };
  }

  return null;
}

function readNftUpgradePrice(item: StoreItem): number {
  const payload = item.effectPayload && typeof item.effectPayload === "object" ? item.effectPayload : {};
  const explicit = Number(
    item.upgradePriceCoins
      ?? payload.upgradePriceCoins
      ?? payload.upgrade_price_coins
      ?? payload.upgradeCost
      ?? payload.upgradeCostBase,
  );
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  return Math.max(100, Math.ceil((item.priceCoins || 400) * 0.25));
}

function isVideoAsset(url?: string | null): boolean {
  return Boolean(url && /\.(mp4|webm|mov)(\?|#|$)/i.test(url));
}



function EffectSwatches({ colors }: { colors: string[] }) {
  const palette = colors.length ? colors.slice(0, 7) : ["#a855f7"];
  return (
    <div className="flex items-center gap-1">
      {palette.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/25"
          style={{ background: color, boxShadow: `0 0 10px ${color}77` }}
        />
      ))}
    </div>
  );
}

function EffectTraitPanel({ preview }: { preview: StoreEffectPreview }) {
  const label = preview.mode === "name_color"
    ? "Цвет ника"
    : preview.mode === "profile_background"
      ? "Цвет фона"
      : preview.label;
  return (
    <div className="mt-3 rounded-2xl glass px-3 py-2 text-[11px] text-white/55">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1"><Palette size={11} /> {label}</span>
        <span className="max-w-[150px] truncate font-bold text-white/75">{preview.description}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-white/35">Отличие товара</span>
        <EffectSwatches colors={preview.colors} />
      </div>
    </div>
  );
}

export function StoreCard({ item, index = 0, onApplied }: { item: StoreItem; index?: number; onApplied?: (item: StoreItem, applied: boolean) => void }) {
  const { user, updateUser } = useAuth();
  const { setTheme, setAccent } = useAppearance();
  const [owned, setOwned] = useState(item.owned);
  const [applied, setApplied] = useState(Boolean(item.applied));
  const [buying, setBuying] = useState(false);
  const [applying, setApplying] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [nftLevel, setNftLevel] = useState(item.level ?? 1);
  const [nftSerial, setNftSerial] = useState<number | null>(item.serialNumber ?? null);
  const [nftMetadata, setNftMetadata] = useState<StoreItem["nftMetadata"]>(item.nftMetadata ?? null);
  const [nftUpgraded, setNftUpgraded] = useState(Boolean(item.isNftUpgraded || item.upgradedAt || item.serialNumber || (item.level ?? 1) > 1 || item.nftMetadata?.upgraded));
  const [reveal, setReveal] = useState<{ serialNumber: number | null; metadata: StoreItem["nftMetadata"] } | null>(null);
  const rarity = RARITY[item.rarity];

  const currentItem: StoreItem = {
    ...item,
    owned,
    applied,
    level: item.category === "nft" ? nftLevel : item.level,
    serialNumber: item.category === "nft" ? nftSerial : item.serialNumber,
    nftMetadata: item.category === "nft" ? nftMetadata : item.nftMetadata,
    isNftUpgraded: item.category === "nft" ? nftUpgraded : item.isNftUpgraded,
    upgradedAt: item.category === "nft" ? (item.upgradedAt ?? nftMetadata?.revealedAt ?? null) : item.upgradedAt,
  };

  const canAfford = (user?.nightCoins ?? 0) >= item.priceCoins;
  const isRealMoney = item.priceCoins === 0 && item.stripePriceId;
  const nftUpgradeCost = readNftUpgradePrice(item);
  const nftUpgradeable = item.category === "nft" && owned && Boolean(item.upgradeable) && !nftUpgraded;
  const canAffordUpgrade = (user?.nightCoins ?? 0) >= nftUpgradeCost;
  const canApplyItem = !(item.category === "nft" && !nftUpgraded);
  const effectPreview = getStoreEffectPreview(item);
  const nftPreviewUrl = item.category === "nft" && nftUpgraded && nftMetadata?.modelUrl ? nftMetadata.modelUrl : item.previewUrl;
  const showOriginalPreview = isDisplayablePreviewUrl(nftPreviewUrl);
  const previewBackground = item.category === "nft" && nftUpgraded && nftMetadata?.backgroundCss
    ? nftMetadata.backgroundCss
    : effectPreview?.background ?? CATEGORY_GRADIENTS[item.category];
  const now = Date.now();
  const dropStarts = item.dropStartsAt ? new Date(item.dropStartsAt).getTime() : null;
  const dropEnds = item.dropEndsAt ? new Date(item.dropEndsAt).getTime() : null;
  const isDrop = Boolean(dropStarts || dropEnds || item.stockTotal);
  const dropUpcoming = Boolean(dropStarts && dropStarts > now);
  const dropEnded = Boolean(dropEnds && dropEnds < now);
  const soldOut = item.stockTotal !== null && item.stockTotal !== undefined && (item.stockSold ?? 0) >= item.stockTotal;
  const dropLocked = dropUpcoming || dropEnded || soldOut;
  const dropLabel = dropUpcoming
    ? `Старт ${new Date(dropStarts!).toLocaleDateString("ru-RU")}`
    : dropEnded
      ? "Drop завершён"
      : soldOut
        ? "Sold out"
        : dropEnds
          ? `до ${new Date(dropEnds).toLocaleDateString("ru-RU")}`
          : "Limited Drop";

  useEffect(() => {
    const upgraded = Boolean(item.isNftUpgraded || item.upgradedAt || item.serialNumber || (item.level ?? 1) > 1 || item.nftMetadata?.upgraded);
    setOwned(item.owned);
    setApplied(Boolean(item.applied));
    setNftLevel(item.level ?? (upgraded ? 2 : 1));
    setNftSerial(item.serialNumber ?? null);
    setNftMetadata(item.nftMetadata ?? null);
    setNftUpgraded(upgraded);
  }, [item.applied, item.isNftUpgraded, item.level, item.nftMetadata, item.owned, item.serialNumber, item.upgradedAt]);

  function applyLocalEffect(effect?: string) {
    const effectType = item.effectType || item.category;
    if (effectType === "theme") {
      const themeId = (item.effectValue as ThemeId | undefined) || themeFromItem(item);
      setTheme(themeId);
      setAccent(themeId);
      localStorage.setItem("ng_active_store_theme", item.id);
    }
    if (effectType === "accent") {
      const accentId = (item.effectValue as ThemeId | undefined) || themeFromItem(item);
      setAccent(accentId);
      localStorage.setItem("ng_active_store_accent", item.id);
    }
    if (effectType === "sticker_pack") localStorage.setItem("ng_active_sticker_pack", item.id);
    if (effectType === "profile_background" || effectType === "nft") localStorage.setItem("ng_active_profile_background", item.id);
    if (effect) localStorage.setItem(`ng_store_effect:${effectType}`, effect);
  }

  async function buyWithCoins() {
    if (!canAfford || owned || dropLocked) return;
    setBuying(true);
    try {
      const res = await api.buyWithCoins(item.id);
      updateUser({
        nightCoins: res.balance,
        ownedItems: [...(user?.ownedItems ?? []), item.id],
      });
      setOwned(true);
      onApplied?.({ ...currentItem, owned: true, applied: false }, false);
      pushGlobalToast(item.category === "nft" ? "Базовый NFT куплен. Номер, фон и моделька откроются после улучшения" : "Предмет куплен. Теперь его можно применить", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось купить предмет";
      pushGlobalToast(message, "error");
    } finally {
      setBuying(false);
    }
  }

  async function applyItem() {
    if (!owned || applied) return;
    if (!canApplyItem) {
      pushGlobalToast("Сначала улучши NFT — фон и serial # откроются после пробуждения", "error");
      return;
    }
    setApplying(true);
    try {
      const res = await api.applyStoreItem(item.id);
      if (res.userPatch) updateUser(res.userPatch);
      const appliedItem = { ...currentItem, ...(res.item ?? {}), applied: true, owned: true };
      if (appliedItem.category === "nft") {
        setNftLevel(appliedItem.level ?? 2);
        setNftSerial(appliedItem.serialNumber ?? nftSerial);
        setNftMetadata(appliedItem.nftMetadata ?? nftMetadata);
        setNftUpgraded(Boolean(appliedItem.isNftUpgraded ?? true));
      }
      applyLocalEffect(res.effect);
      setApplied(true);
      onApplied?.(appliedItem, true);
      pushGlobalToast("Косметика применена", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось применить. Проверь миграцию store item application";
      pushGlobalToast(message, "error");
    } finally {
      setApplying(false);
    }
  }

  async function unapplyItem() {
    if (!owned || !applied) return;
    setApplying(true);
    try {
      const res = await api.unapplyStoreItem(item.id);
      if (res.userPatch) updateUser(res.userPatch);
      const effectType = item.effectType || item.category;
      if (effectType === "theme") {
        setTheme("night");
        setAccent("night");
        localStorage.removeItem("ng_active_store_theme");
      }
      if (effectType === "accent") {
        setAccent("night");
        localStorage.removeItem("ng_active_store_accent");
      }
      if (effectType === "sticker_pack") localStorage.removeItem("ng_active_sticker_pack");
      if (effectType === "profile_background" || effectType === "nft") localStorage.removeItem("ng_active_profile_background");
      setApplied(false);
      onApplied?.({ ...currentItem, applied: false, owned: true }, false);
      pushGlobalToast("Косметика снята", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось снять предмет";
      pushGlobalToast(message, "error");
    } finally {
      setApplying(false);
    }
  }

  async function upgradeNft() {
    if (!owned || !nftUpgradeable || !canAffordUpgrade) return;
    setApplying(true);
    try {
      const res = await api.upgradeNft(item.id);
      const upgradedItem = res.item ?? {
        ...currentItem,
        level: 2,
        serialNumber: res.serialNumber ?? nftSerial,
        nftMetadata: res.nftMetadata ?? nftMetadata,
        upgradedAt: res.upgradedAt ?? new Date().toISOString(),
        isNftUpgraded: true,
        owned: true,
      };
      updateUser({ nightCoins: res.balance });
      setNftLevel(2);
      setNftSerial(upgradedItem.serialNumber ?? null);
      setNftMetadata(upgradedItem.nftMetadata ?? null);
      setNftUpgraded(true);
      onApplied?.({ ...upgradedItem, applied }, applied);
      setReveal({ serialNumber: upgradedItem.serialNumber ?? null, metadata: upgradedItem.nftMetadata ?? null });
      pushGlobalToast(`NFT пробуждён #${upgradedItem.serialNumber ? String(upgradedItem.serialNumber).padStart(4, "0") : "----"}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось улучшить NFT";
      pushGlobalToast(message, "error");
    } finally {
      setApplying(false);
    }
  }

  async function buyWithStripe() {
    setBuying(true);
    try {
      const { url } = await api.createCheckoutSession(item.id);
      window.location.href = url;
    } catch {
      /* ignore */
    } finally {
      setBuying(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.05, 0.4), type: "spring", stiffness: 90, damping: 14 }}
        whileHover={{ y: -6, scale: 1.02 }}
        className="relative group"
      >
        <div
          className="relative gradient-border rounded-4xl glass-strong overflow-visible h-full flex flex-col"
          style={{ boxShadow: rarity.glow }}
        >
          {/* Preview */}
          <div className="relative aspect-[4/3] overflow-hidden">
            <motion.div
              className="absolute inset-0"
              style={{ background: previewBackground }}
              animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
              transition={{ duration: item.category === "nft" && nftUpgraded ? 4 : 6, repeat: Infinity }}
            />
            {item.category === "nft" && nftUpgraded && (
              <motion.div
                className="absolute inset-0 opacity-70"
                style={{ background: "radial-gradient(circle at 50% 42%, rgba(255,255,255,0.28), transparent 26%)" }}
                animate={{ opacity: [0.45, 0.8, 0.45], scale: [1, 1.05, 1] }}
                transition={{ duration: 3.5, repeat: Infinity }}
              />
            )}
            {showOriginalPreview && isVideoAsset(nftPreviewUrl) ? (
              <video src={nftPreviewUrl} className="relative h-full w-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500" autoPlay muted loop playsInline />
            ) : showOriginalPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nftPreviewUrl}
                alt={item.name}
                className={cn(
                  "relative h-full w-full transition-transform duration-500 group-hover:scale-110",
                  item.category === "nft" && nftUpgraded
                    ? "object-contain p-5 opacity-95 drop-shadow-[0_0_28px_rgba(34,211,238,0.38)]"
                    : "object-cover mix-blend-overlay opacity-70",
                )}
                loading="lazy"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-midnight-950/82 via-transparent to-black/10" />

            {/* rarity tag */}
            <span
              className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-md"
              style={{ background: `${rarity.color}22`, color: rarity.color, border: `1px solid ${rarity.color}55` }}
            >
              {rarity.label}
            </span>

            {isDrop && (
              <span className={cn("absolute inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold text-amber-200 backdrop-blur-md border border-amber-300/25", item.category === "nft" ? "top-12 right-3" : "bottom-3 right-3")}>
                <Clock3 size={11} /> {dropLabel}
              </span>
            )}

            {/* owned badge */}
            {owned && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  "absolute top-3 right-3 grid place-items-center rounded-full border",
                  applied
                    ? "h-8 px-2 bg-neon-purple/25 border-neon-purple/60 text-neon-purple text-[10px] font-bold"
                    : "h-8 w-8 bg-green-500/20 border-green-500/50",
                )}
              >
                {applied ? "ACTIVE" : <Check size={16} className="text-green-400" />}
              </motion.div>
            )}

            {item.category === "nft" && (
              <div className="absolute left-3 right-3 bottom-3 rounded-2xl border border-cyan-300/25 bg-black/50 px-3 py-2 backdrop-blur-md shadow-[0_0_24px_rgba(34,211,238,0.14)]">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-cyan-100">{nftUpgraded ? `NFT #${nftSerial ? String(nftSerial).padStart(4, "0") : "----"}` : "BASE NFT"}</span>
                  <span className={nftUpgraded ? "text-neon-gold" : "text-white/45"}>{nftUpgraded ? "UNIQUE" : "LOCKED"}</span>
                </div>
                <div className="mt-1 truncate text-[10px] text-white/45">
                  {nftUpgraded ? (nftMetadata?.modelName || nftMetadata?.colorName || "Уникальная моделька открыта") : "Номер, фон и моделька после улучшения"}
                </div>
              </div>
            )}

            {/* category icon */}
            <div className={cn("absolute left-3 h-9 w-9 rounded-xl glass-strong grid place-items-center", item.category === "nft" ? "top-12" : "bottom-3")}>
              <CategoryIcon category={item.category} preview={effectPreview} />
            </div>
          </div>

          {/* Body */}
          <div className="p-4 flex flex-col flex-1">
            <h3 className="font-display font-bold text-base">{item.name}</h3>
            <p className="text-xs text-white/50 mt-1 flex-1 line-clamp-2">{item.description}</p>
            {effectPreview && item.category !== "nft" && <EffectTraitPanel preview={effectPreview} />}
            {item.category === "nft" && (
              <div className="mt-3 rounded-2xl glass px-3 py-2 text-[11px] text-white/55 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1"><Hash size={11} /> Serial</span>
                  <span className="font-bold text-cyan-200">{nftUpgraded && nftSerial ? `#${String(nftSerial).padStart(4, "0")}` : "после улучшения"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1"><Box size={11} /> Модель</span>
                  <span className="max-w-[130px] truncate font-bold text-white/70">{nftUpgraded ? (nftMetadata?.modelName || "Unique") : "locked"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1"><Palette size={11} /> Фон</span>
                  <span className="max-w-[130px] truncate font-bold text-neon-gold">{nftUpgraded ? (nftMetadata?.colorName || "Unique") : `улучшить · ${formatCoins(nftUpgradeCost)}`}</span>
                </div>
              </div>
            )}

            {isDrop && item.stockTotal !== null && item.stockTotal !== undefined && (
              <div className="mt-3 rounded-2xl glass px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
                  <span className="flex items-center gap-1"><PackageCheck size={12} /> Тираж</span>
                  <span>{item.stockSold ?? 0}/{item.stockTotal}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-neon-purple to-neon-gold" style={{ width: `${Math.min(100, ((item.stockSold ?? 0) / Math.max(1, item.stockTotal)) * 100)}%` }} />
                </div>
              </div>
            )}

            {/* Price + actions */}
            <div className="mt-4 flex items-center justify-between gap-2">
              {isRealMoney ? (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "#fbbf24" }}>
                    <Crown size={15} /> Premium
                  </span>
                  <button
                    onClick={buyWithStripe}
                    disabled={owned || buying}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-semibold transition",
                      owned ? "glass text-white/40" : "btn-glow",
                    )}
                    style={owned ? undefined : { background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
                  >
                    {owned ? "Куплено" : buying ? <Loader2 size={14} className="animate-spin" /> : "Купить"}
                  </button>
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-bold text-neon-gold">
                  <Sparkles size={14} className="fill-neon-gold" />
                  {formatCoins(item.priceCoins)}
                </span>
              )}
            </div>

            {!isRealMoney && item.priceCoins > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={buyWithCoins}
                  disabled={owned || buying || !canAfford || dropLocked}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-45",
                    owned
                      ? "glass text-white/40"
                      : canAfford
                        ? "btn-glow"
                        : "glass text-white/40 cursor-not-allowed",
                  )}
                >
                  {owned ? (
                    <><Check size={14} /> Куплено</>
                  ) : buying ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : dropLocked ? (
                    <span className="flex items-center gap-1"><Lock size={12} /> {soldOut ? "Sold" : dropUpcoming ? "Скоро" : "Закрыт"}</span>
                  ) : !canAfford ? (
                    <span className="flex items-center gap-1"><Lock size={12} /> Мало</span>
                  ) : (
                    <><Sparkles size={14} /> Купить</>
                  )}
                </button>
                <button
                  onClick={() => setGiftOpen(true)}
                  disabled={buying || dropLocked || !canAfford}
                  className="flex items-center justify-center gap-2 rounded-xl glass py-2.5 text-sm font-semibold text-white/65 transition hover:text-white disabled:opacity-45"
                >
                  <Gift size={14} /> Подарить
                </button>
              </div>
            )}

            {owned && item.category === "nft" && (
              <button
                onClick={upgradeNft}
                disabled={!nftUpgradeable || applying || !canAffordUpgrade}
                className={cn(
                  "mt-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition disabled:opacity-45",
                  nftUpgradeable
                    ? "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15"
                    : "border-white/10 bg-white/5 text-white/40",
                )}
              >
                <Gem size={14} /> {nftUpgradeable ? `Улучшить один раз · ${formatCoins(nftUpgradeCost)}` : nftUpgraded ? "NFT уже уникальный" : "Улучшение выключено"}
              </button>
            )}

            {owned && (
              <button
                onClick={applied ? unapplyItem : applyItem}
                disabled={applying || !canApplyItem}
                className={cn(
                  "mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-45",
                  applied ? "glass text-white/65 hover:text-white" : canApplyItem ? "btn-glow" : "glass text-white/35",
                )}
              >
                {applying ? <Loader2 size={14} className="animate-spin" /> : applied ? <RotateCcw size={14} /> : <Wand2 size={14} />}
                {applied ? "Снять" : canApplyItem ? "Применить" : "Сначала улучшить"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
      <GiftStoreItemModal
        open={giftOpen}
        item={item}
        onClose={() => setGiftOpen(false)}
        onGifted={(balance) => updateUser({ nightCoins: balance })}
      />
      <NftRevealModal
        itemName={item.name}
        reveal={reveal}
        canApply={!applied}
        onClose={() => setReveal(null)}
        onApply={() => {
          setReveal(null);
          void applyItem();
        }}
      />
    </>
  );
}

function NftRevealModal({
  reveal,
  itemName,
  canApply,
  onClose,
  onApply,
}: {
  reveal: { serialNumber: number | null; metadata: StoreItem["nftMetadata"] } | null;
  itemName: string;
  canApply: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const metadata = reveal?.metadata;
  const modelUrl = metadata?.modelUrl;
  const colors = metadata?.colors?.length ? metadata.colors : ["#22d3ee", "#a855f7"];
  const background = metadata?.backgroundCss || `radial-gradient(circle at 20% 20%, ${colors[0]}66, transparent 35%), radial-gradient(circle at 82% 70%, ${colors[1] ?? colors[0]}66, transparent 38%), linear-gradient(135deg,#030712,${colors[0]}33,${colors[1] ?? colors[0]}33)`;

  return (
    <AnimatePresence>
      {reveal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10070] grid place-items-center overflow-y-auto bg-black/82 p-4 backdrop-blur-xl">
          <motion.div className="absolute inset-0" style={{ background }} animate={{ filter: ["hue-rotate(0deg)", "hue-rotate(24deg)", "hue-rotate(0deg)"] }} transition={{ duration: 5, repeat: Infinity }} />
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.span
              key={i}
              className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.9)]"
              style={{ left: `${8 + ((i * 17) % 84)}%`, top: `${10 + ((i * 29) % 78)}%` }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0, 1.8, 0], y: [0, -24, -60] }}
              transition={{ duration: 1.6 + (i % 4) * 0.28, delay: i * 0.045, repeat: Infinity, repeatDelay: 1.2 }}
            />
          ))}
          <motion.div initial={{ y: 30, scale: 0.82, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 24, scale: 0.9, opacity: 0 }} transition={{ type: "spring", stiffness: 120, damping: 16 }} className="relative z-10 w-full max-w-lg rounded-[2rem] border border-cyan-300/30 bg-[#060816]/78 p-5 text-center shadow-[0_0_70px_rgba(34,211,238,0.3)] backdrop-blur-2xl">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-xl glass text-white/50 hover:text-white"><X size={16} /></button>
            <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: [0.92, 1.05, 1], rotate: [0, 2, -1, 0] }} transition={{ duration: 1.2 }} className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-cyan-300/35 bg-cyan-300/10 text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.35)]">
              <Gem size={30} />
            </motion.div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-100/70">NFT Reveal</div>
            <h3 className="mt-2 font-display text-2xl font-bold">{itemName} пробуждён</h3>
            <p className="mt-1 text-sm text-white/55">Получены уникальный номер, фон из цветов и моделька.</p>

            <motion.div className="relative mx-auto mt-5 aspect-square w-full max-w-[260px] overflow-hidden rounded-[2rem] border border-white/15 bg-black/30" style={{ background }} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ delay: 0.25, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.28),transparent_32%)]" />
              {modelUrl ? (
                isVideoAsset(modelUrl) ? (
                  <video src={modelUrl} className="relative h-full w-full object-contain p-5" autoPlay muted loop playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={modelUrl} alt="NFT model" className="relative h-full w-full object-contain p-5 drop-shadow-[0_0_35px_rgba(255,255,255,0.35)]" />
                )
              ) : (
                <div className="relative grid h-full place-items-center text-6xl">💠</div>
              )}
              <div className="absolute bottom-3 left-3 right-3 rounded-2xl bg-black/45 px-3 py-2 text-left backdrop-blur-md">
                <div className="text-[11px] font-bold text-cyan-100">NFT #{reveal.serialNumber ? String(reveal.serialNumber).padStart(4, "0") : "----"}</div>
                <div className="truncate text-[10px] text-white/45">{metadata?.modelName || "Unique model"} · {metadata?.colorName || "Unique background"}</div>
              </div>
            </motion.div>

            <div className="mt-5 grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-2xl glass px-2 py-2"><Hash size={13} className="mx-auto mb-1 text-cyan-200" /> serial</div>
              <div className="rounded-2xl glass px-2 py-2"><Palette size={13} className="mx-auto mb-1 text-neon-gold" /> фон</div>
              <div className="rounded-2xl glass px-2 py-2"><Box size={13} className="mx-auto mb-1 text-neon-purple" /> модель</div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button onClick={onClose} className="btn-ghost flex-1 py-3 text-sm">Закрыть</button>
              {canApply && <button onClick={onApply} className="btn-glow flex-1 py-3 text-sm">Применить фон</button>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GiftStoreItemModal({
  open,
  item,
  onClose,
  onGifted,
}: {
  open: boolean;
  item: StoreItem;
  onClose: () => void;
  onGifted: (balance: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [recipient, setRecipient] = useState<Record<string, unknown> | null>(null);
  const [giftMessage, setGiftMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || query.trim().length < 2 || recipient) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.searchUsers(query.trim()).then((data) => setResults(data as Record<string, unknown>[])).catch(() => setResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, query, recipient]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setRecipient(null);
      setGiftMessage("");
      setSending(false);
    }
  }, [open]);

  async function sendGift() {
    if (!recipient) return;
    setSending(true);
    try {
      const res = await api.giftStoreItem(item.id, String(recipient.id), giftMessage.trim() || undefined);
      onGifted(res.balance);
      pushGlobalToast(`Подарок отправлен @${String(recipient.username ?? "user")}`, "success");
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить подарок";
      pushGlobalToast(message, "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10050] grid place-items-center overflow-y-auto bg-black/70 p-4 py-6 sm:py-8 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display text-xl font-bold flex items-center gap-2"><Gift size={18} className="text-neon-gold" /> Подарить товар</h3>
            <p className="mt-1 text-xs text-white/45">Выбери пользователя, которому отправить «{item.name}».</p>

            <div className="mt-4 rounded-3xl glass p-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{item.name}</div>
                  <div className="text-xs text-neon-gold">{formatCoins(item.priceCoins)}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 relative">
              {recipient ? (
                <div className="flex items-center gap-3 rounded-2xl glass px-3 py-2">
                  <GlowAvatar src={(recipient.avatarUrl as string) ?? (recipient.avatar_url as string) ?? null} alt={String(recipient.username ?? "")} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">@{String(recipient.username ?? "")}</div>
                    <div className="text-[11px] text-white/35">#{String(recipient.ngId ?? recipient.ng_id ?? "").padStart(8, "0")}</div>
                  </div>
                  <button onClick={() => { setRecipient(null); setQuery(""); }} className="grid h-8 w-8 place-items-center rounded-xl glass text-white/45 hover:text-white"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти пользователя…" className="ng-input py-2.5 pl-8 text-sm" />
                  {results.length > 0 && (
                    <div className="ng-select-scroll absolute left-0 right-0 top-12 z-30 max-h-56 overflow-y-auto rounded-3xl border border-neon-purple/30 bg-[#090512] p-1.5 pr-3 shadow-[0_0_34px_rgba(168,85,247,0.28)]">
                      {results.map((u) => (
                        <button key={String(u.id)} onClick={() => { setRecipient(u); setQuery(String(u.username ?? "")); setResults([]); }} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm text-white/70 hover:bg-white/8 hover:text-white">
                          <GlowAvatar src={(u.avatarUrl as string) ?? (u.avatar_url as string) ?? null} alt={String(u.username ?? "")} size={28} />
                          <span className="min-w-0 flex-1 truncate">@{String(u.username ?? "")}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <textarea
              value={giftMessage}
              onChange={(e) => setGiftMessage(e.target.value.slice(0, 160))}
              rows={2}
              placeholder="Сообщение к подарку — необязательно"
              className="ng-input mt-4 resize-none py-2.5 text-sm"
            />

            <button onClick={sendGift} disabled={!recipient || sending} className="btn-glow mt-4 w-full py-3 text-sm disabled:opacity-45">
              {sending ? <Loader2 size={15} className="animate-spin inline mr-1" /> : <Gift size={15} className="inline mr-1" />} Отправить подарок
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CategoryIcon({ category, preview }: { category: StoreItem["category"]; preview?: StoreEffectPreview | null }) {
  const logos: Record<string, { glyph: string; bg: string; glow: string }> = {
    theme: { glyph: "◈", bg: "linear-gradient(135deg,#6366f1,#a855f7,#ec4899)", glow: "rgba(168,85,247,0.34)" },
    color_pack: { glyph: "●", bg: "conic-gradient(from 120deg,#fbbf24,#ec4899,#22d3ee,#34d399,#fbbf24)", glow: "rgba(34,211,238,0.32)" },
    sticker_pack: { glyph: "✿", bg: "linear-gradient(135deg,#22d3ee,#6366f1,#a855f7)", glow: "rgba(34,211,238,0.3)" },
    frame: { glyph: "◇", bg: "linear-gradient(135deg,#0b0716,#a855f7,#22d3ee)", glow: "rgba(168,85,247,0.34)" },
    glow_effect: { glyph: "✺", bg: "radial-gradient(circle,#fff 0 10%,#ec4899 24%,#a855f7 58%,#090512 100%)", glow: "rgba(236,72,153,0.36)" },
    badge: { glyph: "♛", bg: "linear-gradient(135deg,#fbbf24,#a855f7,#ec4899)", glow: "rgba(251,191,36,0.34)" },
    nft: { glyph: "⬡", bg: "linear-gradient(135deg,#00f5d4,#a855f7,#fbbf24)", glow: "rgba(0,245,212,0.34)" },
  };
  const logo = logos[category] ?? { glyph: "✦", bg: "linear-gradient(135deg,#a855f7,#ec4899)", glow: "rgba(168,85,247,0.3)" };
  const colors = preview?.colors?.length ? preview.colors : [];
  const animatedBg = colors.length > 0
    ? `conic-gradient(from 0deg, ${colors.join(", ")}, ${colors[0]})`
    : logo.bg;
  const glow = colors[0] ? `${colors[0]}88` : logo.glow;

  return (
    <span className="relative grid h-8 w-8 overflow-hidden rounded-xl border border-white/15 text-[13px] font-black text-white" style={{ boxShadow: `0 0 14px ${glow}` }}>
      <motion.span
        className="absolute -inset-3"
        style={{ background: animatedBg }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: "linear" }}
      />
      <span className="absolute inset-0 bg-black/18" />
      <span className="relative z-10 grid place-items-center drop-shadow-[0_1px_5px_rgba(0,0,0,0.9)]">{logo.glyph}</span>
    </span>
  );
}
