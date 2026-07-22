"use client";

import { DesktopSettingsCard } from "@/components/desktop/DesktopSettingsCard";

// =============================================================================
//  NightGram Web — Settings page (multi-section)
//  Profile · Security · Notifications · Appearance · Integrations · Moderation
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Check,
  Loader2,
  Camera,
  Sparkles,
  Save,
  User as UserIcon,
  Shield,
  Bell,
  Palette,
  Plug,
  Gavel,
  AtSign,
  Hash,
  Image as ImageIcon,
  Lock,
  Crown,
  UsersRound,
  UserPlus,
  LogIn,
  Star,
  Ban,
  Hash as HashIcon,
  Search,
  Plus,
  Trash2,
  X,
  Volume2,
  ShoppingBag,
  Home,
  MonitorSmartphone,
  RefreshCw,
  LogOut,
  Eye,
  EyeOff,
  MessageCircle,
  UserX,
  KeyRound,
  Copy,
  CheckCircle2,
  ExternalLink,
  Smartphone,
  QrCode,
  History,
  TriangleAlert,
  Clock3,
  Download,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppearanceSettings, AuthDeviceSession, AuthSession, NotificationSettings, PrivacyAudience, User, StoreItem, SecurityEvent, TwoFactorRecoveryRequest } from "@/types";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { useAuth } from "@/context/AuthContext";
import { useAppearance, THEMES, ACCENTS } from "@/context/AppearanceContext";
import { api, getStoredAccessToken, getStoredRefreshToken } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { NAME_COLORS } from "@/lib/nameColors";
import { PremiumRequiredModal } from "@/components/shared/PremiumRequiredModal";
import { CustomSelect } from "@/components/shared/CustomSelect";
import { DEFAULT_NOTIFICATION_SETTINGS, isQuietHours, normalizeNotificationSettings } from "@/lib/notificationPreferences";
import { disableWebPush, enableWebPush, getWebPushState, type WebPushState } from "@/lib/pushNotifications";

type Tab = "profile" | "accounts" | "room" | "social" | "privacy" | "security" | "notifications" | "appearance" | "audio" | "integrations" | "moderation";


const MARKET_THEME_IDS = new Set(["navy", "mint", "void", "obsidian", "plum", "bloodmoon", "cyber", "aurora", "nebula", "dracula", "ice", "terminal", "coffee", "cream"]);
const MARKET_ACCENT_IDS = MARKET_THEME_IDS;

function isMarketNameColorId(id: string): boolean {
  const graphiteIndex = NAME_COLORS.findIndex((preset) => preset.id === "graphite");
  const index = NAME_COLORS.findIndex((preset) => preset.id === id);
  return graphiteIndex >= 0 && index > graphiteIndex;
}

function isMarketAvatarFrameId(id: string | null): boolean {
  return Boolean(id && id !== "verified" && id !== "premium");
}

function hasOwnedStoreEffect(items: StoreItem[], effectType: string, effectValue: string | null | undefined): boolean {
  return items.some((item) => {
    const type = item.effectType || item.category;
    if (type !== effectType) return false;
    if (effectValue === null || effectValue === undefined) return true;
    return String(item.effectValue ?? "").toLowerCase() === String(effectValue).toLowerCase();
  });
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "accounts", label: "Аккаунты", icon: UserPlus },
  { id: "room", label: "Комната", icon: Home },
  { id: "social", label: "Социальное", icon: UsersRound },
  { id: "privacy", label: "Приватность", icon: EyeOff },
  { id: "security", label: "Безопасность", icon: Shield },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "appearance", label: "Внешний вид", icon: Palette },
  { id: "audio", label: "Звук", icon: Volume2 },
  { id: "integrations", label: "Интеграции", icon: Plug },
  { id: "moderation", label: "Модерация", icon: Gavel },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");

  const isAdmin = ["admin", "owner", "co_owner", "moderator", "support"].includes(user?.role ?? "");
  const tabs = isAdmin ? TABS : TABS.filter((t) => t.id !== "moderation");

  return (
    <div className="relative max-w-4xl mx-auto px-4 pb-28">
      <AuroraBackground intensity={0.4} className="absolute top-0 left-0 right-0 h-96 -z-10" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 mb-6"
      >
        <button
          onClick={() => router.back()}
          className="grid place-items-center h-10 w-10 rounded-xl glass hover:border-neon-purple/50 transition"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-2xl">Настройки</h1>
          <p className="text-sm text-white/45">Управляй своим NightGram</p>
        </div>
      </motion.div>

      <div className="grid md:grid-cols-[200px_1fr] gap-5">
        {/* Tab sidebar */}
        <div className="flex md:flex-col gap-1.5 overflow-x-auto scrollbar-hide md:overflow-visible">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm whitespace-nowrap transition shrink-0",
                  active
                    ? "bg-neon-purple/15 text-white border border-neon-purple/40 shadow-glow"
                    : "glass text-white/55 hover:text-white",
                )}
              >
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
            >
              {tab === "profile" && <ProfileSection />}
              {tab === "accounts" && <AccountsSection />}
              {tab === "room" && <RoomSection />}
              {tab === "social" && <SocialSection />}
              {tab === "privacy" && <PrivacySection />}
              {tab === "security" && <SecuritySection />}
              {tab === "notifications" && <NotificationsSection />}
              {tab === "notifications" && <div className="mt-4"><DesktopSettingsCard /></div>}
              {tab === "appearance" && <AppearanceSection />}
              {tab === "audio" && <AudioSection />}
              {tab === "integrations" && <IntegrationsSection />}
              {tab === "moderation" && <ModerationSection />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
//  Accounts section
// =============================================================================

const MULTI_ACCOUNTS_KEY = "ng_multi_accounts";

type StoredAccount = AuthSession;

function readStoredAccounts(): StoredAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(MULTI_ACCOUNTS_KEY) || "[]") as StoredAccount[];
    const seen = new Set<string>();
    return parsed
      .filter((account) => account?.user?.id && account.accessToken && account.refreshToken)
      .filter((account) => {
        if (seen.has(account.user.id)) return false;
        seen.add(account.user.id);
        return true;
      });
  } catch {
    return [];
  }
}

function writeStoredAccounts(accounts: StoredAccount[]) {
  const seen = new Set<string>();
  const clean = accounts.filter((account) => {
    if (!account?.user?.id || seen.has(account.user.id)) return false;
    seen.add(account.user.id);
    return true;
  });
  localStorage.setItem(MULTI_ACCOUNTS_KEY, JSON.stringify(clean));
  return clean;
}

function upsertStoredAccount(accounts: StoredAccount[], account: StoredAccount) {
  return writeStoredAccounts([account, ...accounts.filter((item) => item.user.id !== account.user.id)]);
}

function currentStoredSession(user: User): StoredAccount | null {
  const accessToken = getStoredAccessToken();
  const refreshToken = getStoredRefreshToken();
  if (!accessToken || !refreshToken) return null;
  return {
    user,
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

function AccountsSection() {
  const router = useRouter();
  const { user, switchAccount } = useAuth();
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [adding, setAdding] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = user?.isPremium ? 3 : 1;
  const currentId = user?.id ?? "";
  const canAdd = Boolean(user?.isPremium && accounts.length < limit);

  useEffect(() => {
    if (!user) return;
    const stored = readStoredAccounts();
    const current = currentStoredSession(user);
    const next = current ? upsertStoredAccount(stored, current) : stored;
    setAccounts(next);
  }, [user]);

  function openAddAccount() {
    setError(null);
    if (!user?.isPremium) {
      setError("Дополнительные аккаунты доступны с Premium: основной аккаунт + 2 дополнительных.");
      return;
    }
    if (accounts.length >= limit) {
      setError("Лимит Premium: основной аккаунт + 2 дополнительных.");
      return;
    }
    setModalOpen(true);
  }

  async function authenticateAccount(mode: "login" | "register", payload: { username?: string; email: string; password: string }) {
    if (!user) return;
    if (!user.isPremium) throw new Error("Дополнительные аккаунты доступны с Premium.");
    if (accounts.length >= limit) throw new Error("Лимит Premium: основной аккаунт + 2 дополнительных.");

    setAdding(true);
    setError(null);
    try {
      const current = currentStoredSession(user);
      const base = current ? upsertStoredAccount(accounts, current) : accounts;
      const session = mode === "login"
        ? await api.login({ email: payload.email.trim(), password: payload.password })
        : await api.register({ username: (payload.username || "").trim(), email: payload.email.trim(), password: payload.password });
      if ("challengeToken" in session) {
        throw new Error("Для этого аккаунта включена двухэтапная защита. Войди через обычную страницу входа, затем добавь аккаунт снова.");
      }
      const next = upsertStoredAccount(base, session).slice(0, limit);
      setAccounts(next);
      switchAccount(session);
      setModalOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось добавить аккаунт";
      const clean = message.includes("401") ? "Неверная почта или пароль" : message;
      setError(clean);
      throw new Error(clean);
    } finally {
      setAdding(false);
    }
  }

  function switchTo(account: StoredAccount) {
    switchAccount(account);
    router.refresh();
  }

  function removeAccount(id: string) {
    if (id === currentId) return;
    const next = writeStoredAccounts(accounts.filter((account) => account.user.id !== id));
    setAccounts(next);
  }

  if (!user) return null;

  return (
    <>
      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-5">
        <SectionTitle icon={UserPlus} title="Аккаунты" desc="Быстро переключайся между несколькими аккаунтами NightGram" />

        <div className="rounded-3xl glass p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Слоты аккаунтов</div>
              <div className="text-xs text-white/45">Без Premium доступен 1 аккаунт. Premium открывает ещё 2 дополнительных.</div>
            </div>
            <div className="rounded-full border border-neon-purple/25 bg-neon-purple/10 px-3 py-1 text-xs font-bold text-neon-purple">
              {accounts.length}/{limit}
            </div>
          </div>
          {!user.isPremium && (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs text-amber-100">
              <Crown size={13} className="mr-1 inline" /> Добавление второго и третьего аккаунта доступно с Premium.
            </div>
          )}
        </div>

        <div className="space-y-2">
          {accounts.map((account) => {
            const active = account.user.id === currentId;
            return (
              <div key={account.user.id} className={cn("flex items-center gap-3 rounded-3xl border p-3", active ? "border-neon-purple/40 bg-neon-purple/10 shadow-glow" : "border-white/10 bg-white/[0.035]") }>
                <GlowAvatar src={account.user.avatarUrl} alt={account.user.username} size={46} glow={account.user.glowEffect ?? undefined} frame={account.user.avatarFrame ?? undefined} ringColor={account.user.nameColor} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-semibold">{account.user.displayName || account.user.username}</div>
                    {account.user.isPremium && <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">Premium</span>}
                  </div>
                  <div className="truncate text-xs text-white/42">@{account.user.username} · #{String(account.user.ngId ?? "").padStart(8, "0")}</div>
                </div>
                {active ? (
                  <span className="rounded-xl bg-neon-purple/20 px-3 py-2 text-xs font-semibold text-white"><Check size={13} className="mr-1 inline" />Активен</span>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => switchTo(account)} className="btn-glow px-3 py-2 text-xs"><LogIn size={13} className="mr-1 inline" />Войти</button>
                    <button onClick={() => removeAccount(account.user.id)} className="grid h-9 w-9 place-items-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-3xl glass p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold text-sm"><Plus size={15} className="text-neon-purple" /> Добавить аккаунт</div>
              <div className="mt-1 text-xs text-white/42">Откроется отдельное окно: вход в существующий аккаунт или регистрация нового.</div>
            </div>
            <button onClick={openAddAccount} className="btn-glow px-5 py-3 text-sm disabled:opacity-45" disabled={adding || (user.isPremium && accounts.length >= limit)}>
              <UserPlus size={15} className="mr-1 inline" /> Добавить
            </button>
          </div>
          {error && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </div>
      </div>

      <AccountAuthModal
        open={modalOpen}
        loading={adding}
        onClose={() => setModalOpen(false)}
        onSubmit={authenticateAccount}
      />
    </>
  );
}

function AccountAuthModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (mode: "login" | "register", payload: { username?: string; email: string; password: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("login");
    setUsername("");
    setEmail("");
    setPassword("");
    setLocalError(null);
  }, [open]);

  async function submit() {
    setLocalError(null);
    if (!email.trim() || !password.trim()) return;
    if (mode === "register" && username.trim().length < 3) {
      setLocalError("Username должен быть минимум 3 символа.");
      return;
    }
    try {
      await onSubmit(mode, { username, email, password });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Не удалось добавить аккаунт");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-black/70 p-4 py-6 sm:py-8 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display text-xl font-bold flex items-center gap-2"><UserPlus size={18} className="text-neon-purple" /> Добавить аккаунт</h3>
            <p className="mt-1 text-xs text-white/45">Войди в существующий аккаунт или создай новый — после успеха NightGram переключится на него.</p>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl glass p-1">
              <button onClick={() => setMode("login")} className={mode === "login" ? "btn-glow py-2 text-xs" : "rounded-xl px-3 py-2 text-xs text-white/55 hover:text-white"}>Войти</button>
              <button onClick={() => setMode("register")} className={mode === "register" ? "btn-glow py-2 text-xs" : "rounded-xl px-3 py-2 text-xs text-white/55 hover:text-white"}>Регистрация</button>
            </div>

            <div className="mt-4 space-y-3">
              {mode === "register" && (
                <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="username" className="ng-input py-3 text-sm" maxLength={24} />
              )}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="ng-input py-3 text-sm" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "login" ? "Пароль" : "Пароль · минимум 6 символов"} className="ng-input py-3 text-sm" minLength={mode === "register" ? 6 : undefined} />
              {localError && <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{localError}</div>}
              <button onClick={submit} disabled={loading || !email.trim() || !password.trim() || (mode === "register" && username.trim().length < 3)} className="btn-glow w-full py-3 text-sm disabled:opacity-45">
                {loading ? <Loader2 size={15} className="mr-1 inline animate-spin" /> : mode === "login" ? <LogIn size={15} className="mr-1 inline" /> : <UserPlus size={15} className="mr-1 inline" />}
                {mode === "login" ? "Войти и добавить" : "Создать и добавить"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// =============================================================================
//  Profile section
// =============================================================================

const AVATAR_FRAME_PRESETS: { id: string | null; label: string; emoji: string; preview: string }[] = [
  { id: null, label: "Без рамки", emoji: "○", preview: "linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))" },
  { id: "gradient", label: "Aurora", emoji: "🌌", preview: "linear-gradient(90deg,#a855f7,#ec4899,#22d3ee)" },
  { id: "rainbow", label: "Prism", emoji: "🌈", preview: "linear-gradient(90deg,#ef4444,#f97316,#facc15,#22c55e,#06b6d4,#6366f1,#ec4899)" },
  { id: "premium", label: "Gold Nova", emoji: "👑", preview: "linear-gradient(90deg,#fbbf24,#f59e0b,#fff7ad)" },
  { id: "verified", label: "Verified", emoji: "✅", preview: "linear-gradient(90deg,#38bdf8,#2563eb,#22d3ee)" },
  { id: "dual:#a855f7:#ec4899", label: "Violet Rose", emoji: "💜", preview: "linear-gradient(90deg,#a855f7,#ec4899)" },
  { id: "dual:#22d3ee:#8b5cf6", label: "Cyber Ice", emoji: "💎", preview: "linear-gradient(90deg,#22d3ee,#8b5cf6)" },
  { id: "dual:#34d399:#14b8a6", label: "Emerald", emoji: "🍃", preview: "linear-gradient(90deg,#34d399,#14b8a6)" },
  { id: "dual:#fb7185:#fbbf24", label: "Sunset", emoji: "🌇", preview: "linear-gradient(90deg,#fb7185,#fbbf24)" },
  { id: "dual:#111827:#a855f7", label: "Void", emoji: "🖤", preview: "linear-gradient(90deg,#111827,#a855f7)" },
];

function ProfileSection() {
  const { user, updateUser } = useAuth();
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? null);
  const [bannerUrl, setBannerUrl] = useState(user?.bannerUrl ?? null);
  const [nameColor, setNameColor] = useState(user?.nameColor ?? "#a855f7");
  const [nameColorId, setNameColorId] = useState(user?.nameColorId ?? "night");
  const [customId, setCustomId] = useState(user?.customId ?? "");
  const [nightStatusText, setNightStatusText] = useState(user?.nightStatusText ?? "");
  const [nightStatusEmoji, setNightStatusEmoji] = useState(user?.nightStatusEmoji ?? "🌙");
  const [avatarFrame, setAvatarFrame] = useState(user?.avatarFrame ?? null);
  const [frameMenuOpen, setFrameMenuOpen] = useState(false);
  const [ownedStoreItems, setOwnedStoreItems] = useState<StoreItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [showPremiumBannerModal, setShowPremiumBannerModal] = useState(false);

  useEffect(() => {
    let active = true;
    const username = user?.username;
    if (!username) {
      setOwnedStoreItems([]);
      return;
    }
    api.getOwnedStoreItems(username)
      .then((items) => { if (active) setOwnedStoreItems(items); })
      .catch(() => { if (active) setOwnedStoreItems([]); });
    return () => { active = false; };
  }, [user?.username]);

  if (!user) return null;

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setProfileNotice(null);
    try {
      const url = await uploadMedia(f, "avatars");
      setAvatarUrl(url);
      setProfileNotice("Аватар загружен. Нажми «Сохранить изменения».");
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : "Не удалось загрузить аватар");
    } finally {
      e.target.value = "";
    }
  }

  async function pickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setProfileNotice(null);
    try {
      const url = await uploadMedia(f, "posts");
      setBannerUrl(url);
      setProfileNotice("Баннер загружен. Нажми «Сохранить изменения».");
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : "Не удалось загрузить баннер");
    } finally {
      e.target.value = "";
    }
  }

  async function onSave() {
    setSaving(true);
    setSaved(false);
    const patch = {
      displayName,
      bio,
      avatarUrl,
      bannerUrl,
      nameColor,
      nameColorId,
      avatarFrame,
      customId: customId.trim() || null,
      nightStatusText: nightStatusText.trim() || null,
      nightStatusEmoji: nightStatusText.trim() ? nightStatusEmoji : null,
      nightStatusExpiresAt: nightStatusText.trim() ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
    };
    try {
      const updated = await api.updateProfile(patch);
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setProfileNotice(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  }

  const ngIdDisplay = String(user.ngId).padStart(8, "0");
  const availableAvatarFrames = user.verified || avatarFrame === "verified"
    ? AVATAR_FRAME_PRESETS
    : AVATAR_FRAME_PRESETS.filter((frame) => frame.id !== "verified");
  const visibleAvatarFrames = availableAvatarFrames.filter((frame) => !isMarketAvatarFrameId(frame.id) || hasOwnedStoreEffect(ownedStoreItems, "avatar_frame", frame.id));
  const activeAvatarFrame = visibleAvatarFrames.find((item) => item.id === avatarFrame) ?? visibleAvatarFrames[0] ?? AVATAR_FRAME_PRESETS[0];

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-5">
      <SectionTitle icon={UserIcon} title="Профиль" desc="Аватар, баннер, имя и ID" />

      {profileNotice && (
        <div className="rounded-2xl border border-neon-purple/25 bg-neon-purple/10 px-3 py-2 text-xs text-white/70">
          {profileNotice}
        </div>
      )}

      {/* Banner — gradient by default, custom upload needs Premium */}
      <div>
        <label className="text-xs text-white/60 mb-2 ml-1 flex items-center gap-1.5">
          Баннер
          {!user.isPremium && (
            <span className="text-[10px] text-white/30">для загрузки своего нужен Premium</span>
          )}
        </label>
        <button
          onClick={() => {
            if (!user.isPremium) {
              setShowPremiumBannerModal(true);
            } else {
              bannerInput.current?.click();
            }
          }}
          className="relative w-full h-28 md:h-32 rounded-2xl overflow-hidden group glass"
        >
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="h-full w-full grid place-items-center text-white/40"
              style={{ background: `linear-gradient(120deg, ${nameColor}, var(--accent-tertiary), var(--accent-secondary))` }}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Camera size={16} /> {user.isPremium ? "Загрузить баннер" : "Стандартный баннер"}
              </span>
            </div>
          )}
          <div className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition">
            <Camera size={24} />
          </div>
        </button>
        <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={pickBanner} />
      </div>

      {/* Avatar + banner */}
      <div className="flex items-center gap-5">
        <button onClick={() => avatarInput.current?.click()} className="relative group shrink-0">
          <GlowAvatar
            src={avatarUrl}
            alt={displayName || "me"}
            size={88}
            glow={nameColor === "#fbbf24" ? "gold" : nameColor === "#ec4899" ? "pink" : nameColor === "#22d3ee" ? "cyan" : "purple"}
            frame={avatarFrame ?? undefined}
            ringColor={nameColor}
          />
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition">
            <Camera size={22} />
          </span>
        </button>
        <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
        <div>
          <div className="font-semibold text-lg">{displayName || "Без имени"}</div>
          <button onClick={() => avatarInput.current?.click()} className="text-sm text-neon-purple hover:underline flex items-center gap-1.5 mt-1">
            <Camera size={14} /> Сменить аватар
          </button>
        </div>
      </div>

      <FieldBlock label="Отображаемое имя">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} placeholder="Твоё имя" className="ng-input" />
      </FieldBlock>

      <FieldBlock label="О себе">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} placeholder="Расскажи о себе…" className="ng-input resize-none" />
        <div className="text-right text-xs text-white/30 mt-1">{bio.length}/160</div>
      </FieldBlock>

      <FieldBlock label="Night Status" icon={<Sparkles size={13} className="text-neon-purple" />}>
        <div className="grid grid-cols-[72px_1fr] gap-2">
          <input value={nightStatusEmoji} onChange={(e) => setNightStatusEmoji(e.target.value.slice(0, 3))} maxLength={3} className="ng-input text-center" placeholder="🌙" />
          <input value={nightStatusText} onChange={(e) => setNightStatusText(e.target.value.slice(0, 48))} maxLength={48} className="ng-input" placeholder="в ночном режиме / слушаю музыку / не беспокоить" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["🌙 в ночном режиме", "🎧 слушаю музыку", "💻 кодю", "🔥 открыт для общения", "🛡️ не беспокоить"].map((preset) => {
            const [emoji, ...words] = preset.split(" ");
            return <button key={preset} type="button" onClick={() => { setNightStatusEmoji(emoji); setNightStatusText(words.join(" ")); }} className="rounded-full glass px-2.5 py-1 text-[11px] text-white/55 hover:text-white">{preset}</button>;
          })}
          {nightStatusText && <button type="button" onClick={() => setNightStatusText("")} className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">очистить</button>}
        </div>
        <div className="mt-2 text-[11px] text-white/35">Статус показывается в профиле и живёт 24 часа после сохранения.</div>
      </FieldBlock>

      {/* Custom ID — free for all */}
      <FieldBlock label="Кастомный ID" icon={<AtSign size={13} className="text-neon-purple" />}>
        <div className="flex items-center gap-2">
          <span className="text-white/40 text-sm">@</span>
          <input
            value={customId}
            onChange={(e) => setCustomId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            maxLength={20}
            placeholder="username"
            className="ng-input flex-1"
          />
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
          <Hash size={12} />
          {customId.trim() ? (
            <span>Твой публичный ID: <b className="text-neon-purple">@{customId.trim()}</b></span>
          ) : (
            <span>Без кастомного ID ты отображаешься как <b className="text-white/60">#{ngIdDisplay}</b></span>
          )}
        </div>
      </FieldBlock>

      {/* Name color — Premium feature */}
      <NameColorPicker
        nameColor={nameColor}
        setNameColor={(color, id) => { setNameColor(color); setNameColorId(id); }}
        activeId={nameColorId}
        isPremium={user.isPremium}
        ownedStoreItems={ownedStoreItems}
      />

      <div className="relative">
        <span className="flex items-center gap-1.5 text-sm text-white/65 mb-2 ml-1">
          <Sparkles size={13} className="text-neon-purple" /> Рамка аватара
          {!user.isPremium && <span className="ml-auto text-[10px] text-white/30">нужен Premium</span>}
        </span>
        <button
          type="button"
          onClick={() => user.isPremium && setFrameMenuOpen((v) => !v)}
          className={cn("flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition", user.isPremium ? "hover:brightness-110" : "opacity-55 cursor-not-allowed")}
          style={{ background: `linear-gradient(135deg, rgba(7,3,18,0.68), rgba(7,3,18,0.94)), ${activeAvatarFrame.preview}`, borderColor: "rgba(255,255,255,0.16)", boxShadow: "0 0 18px rgba(168,85,247,0.14)" }}
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-lg" style={{ background: activeAvatarFrame.preview }}>
            {activeAvatarFrame.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white/80">{activeAvatarFrame.label}</span>
            <span className="block text-xs text-white/40">Готовый пресет рамки, без ручной палитры</span>
          </span>
          <span className="text-xs text-white/35">{frameMenuOpen ? "Свернуть" : "Выбрать"}</span>
        </button>
        <AnimatePresence>
          {frameMenuOpen && user.isPremium && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="ng-select-scroll mt-2 mb-4 max-h-72 overflow-y-auto rounded-3xl border border-neon-purple/30 bg-[#090512] p-2 pr-3 shadow-[0_0_34px_rgba(168,85,247,0.28)]"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visibleAvatarFrames.map((item) => {
                  const active = avatarFrame === item.id;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => { setAvatarFrame(item.id); setFrameMenuOpen(false); }}
                      className={cn("rounded-2xl border px-3 py-2 text-left text-xs transition", active ? "bg-neon-purple/20 border-neon-purple/50 text-white shadow-glow" : "glass border-white/10 text-white/60 hover:text-white hover:border-white/25")}
                    >
                      <span className="mb-1 flex items-center gap-2"><span>{item.emoji}</span><span className="font-semibold">{item.label}</span></span>
                      <span className="block h-1.5 rounded-full" style={{ background: item.preview }} />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={onSave} disabled={saving} className="btn-glow px-6 py-3 inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {saving ? <Loader2 size={18} className="animate-spin" /> : saved ? <Check size={18} /> : <Save size={18} />}
          {saving ? "Сохранение…" : saved ? "Сохранено!" : "Сохранить"}
        </button>
      </div>

      {/* Premium required modal (banner upload) */}
      <PremiumRequiredModal
        open={showPremiumBannerModal}
        onClose={() => setShowPremiumBannerModal(false)}
        feature="Загрузка своего баннера"
      />

      <style jsx>{`
        :global(.ng-input) {
          width: 100%;
          background: rgba(255, 255, 255, 0.055);
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 20px;
          padding: 14px 16px;
          color: #fff;
          outline: none;
          transition: all 0.2s;
        }
        :global(.ng-input:focus) {
          border-color: rgba(168, 85, 247, 0.6);
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
        }
        :global(.ng-input::placeholder) {
          color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

// =============================================================================
//  Social section
// =============================================================================


// =============================================================================
//  Room section
// =============================================================================

const ROOM_SCENES: { id: NonNullable<User["roomScene"]>; label: string; emoji: string; bg: string; desc: string }[] = [
  { id: "midnight", label: "Midnight Desk", emoji: "🌙", bg: "radial-gradient(circle at 18% 20%, rgba(168,85,247,0.34), transparent 38%), radial-gradient(circle at 84% 74%, rgba(99,102,241,0.24), transparent 42%)", desc: "Классическая ночная комната" },
  { id: "cyber", label: "Cyber Room", emoji: "👾", bg: "radial-gradient(circle at 18% 20%, rgba(0,245,212,0.28), transparent 38%), radial-gradient(circle at 84% 74%, rgba(217,70,239,0.24), transparent 42%)", desc: "Неон, терминалы и cyber glow" },
  { id: "gold", label: "Gold Lounge", emoji: "✨", bg: "radial-gradient(circle at 18% 20%, rgba(251,191,36,0.30), transparent 38%), radial-gradient(circle at 84% 74%, rgba(249,115,22,0.2), transparent 42%)", desc: "Тёплая premium-витрина" },
  { id: "rain", label: "Rain Window", emoji: "🌧️", bg: "radial-gradient(circle at 18% 20%, rgba(56,189,248,0.25), transparent 38%), radial-gradient(circle at 84% 74%, rgba(30,41,59,0.34), transparent 42%)", desc: "Ночное окно и дождь" },
  { id: "void", label: "Void Gallery", emoji: "🕳️", bg: "radial-gradient(circle at 18% 20%, rgba(17,24,39,0.58), transparent 38%), radial-gradient(circle at 84% 74%, rgba(168,85,247,0.24), transparent 42%)", desc: "Тёмная галерея коллекции" },
];

function RoomSection() {
  const { user, updateUser } = useAuth();
  const [musicArtist, setMusicArtist] = useState(user?.musicArtist ?? "");
  const [musicTrack, setMusicTrack] = useState(user?.musicTrack ?? "");
  const [roomScene, setRoomScene] = useState<NonNullable<User["roomScene"]>>(user?.roomScene || "midnight");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  async function saveRoom() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateProfile({
        musicArtist: musicArtist.trim() || null,
        musicTrack: musicTrack.trim() || null,
        roomScene,
      });
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      // keep values editable
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-5">
      <SectionTitle icon={Home} title="Комната профиля" desc="Отдельные настройки комнаты, музыки и атмосферы профиля" />

      <div className="rounded-3xl glass p-4 space-y-3">
        <SectionTitleInline icon={Volume2} title="Музыка комнаты" desc="Показывается в Profile Room и рядом с атмосферой профиля" />
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={musicArtist} onChange={(e) => setMusicArtist(e.target.value.slice(0, 64))} maxLength={64} className="ng-input" placeholder="Автор / исполнитель" />
          <input value={musicTrack} onChange={(e) => setMusicTrack(e.target.value.slice(0, 80))} maxLength={80} className="ng-input" placeholder="Название трека" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Crystal Castles — Not In Love", "Pastel Ghost — Dark Beach", "Øneheart — Snowfall", "Mr.Kitty — After Dark"].map((preset) => {
            const [artist, track] = preset.split(" — ");
            return <button key={preset} type="button" onClick={() => { setMusicArtist(artist); setMusicTrack(track); }} className="rounded-full glass px-2.5 py-1 text-[11px] text-white/55 hover:text-white">{preset}</button>;
          })}
          {(musicArtist || musicTrack) && <button type="button" onClick={() => { setMusicArtist(""); setMusicTrack(""); }} className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">очистить</button>}
        </div>
      </div>

      <div className="rounded-3xl glass p-4 space-y-3">
        <SectionTitleInline icon={Home} title="Сцена комнаты" desc="Выбери атмосферу Profile Room" />
        <div className="grid gap-2 sm:grid-cols-2">
          {ROOM_SCENES.map((scene) => {
            const active = roomScene === scene.id;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => setRoomScene(scene.id)}
                className={cn("relative overflow-hidden rounded-3xl border p-3 text-left transition", active ? "border-neon-purple/50 shadow-glow" : "border-white/10 hover:border-white/25")}
              >
                <div className="absolute inset-0 opacity-80" style={{ background: scene.bg }} />
                <div className="relative flex items-center gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-black/35 text-xl">{scene.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white/85">{scene.label}</div>
                    <div className="text-xs text-white/48">{scene.desc}</div>
                  </div>
                  {active && <Check size={16} className="text-neon-purple" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={saveRoom} disabled={saving} className="btn-glow px-6 py-3 inline-flex items-center justify-center gap-2 disabled:opacity-60">
        {saving ? <Loader2 size={18} className="animate-spin" /> : saved ? <Check size={18} /> : <Save size={18} />}
        {saving ? "Сохранение…" : saved ? "Сохранено!" : "Сохранить комнату"}
      </button>
    </div>
  );
}

function SocialSection() {
  const { user, updateUser } = useAuth();
  const [hideSocial, setHideSocial] = useState(Boolean(user?.hideSocial));
  const [hidePurchases, setHidePurchases] = useState(Boolean(user?.hidePurchases));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [circles, setCircles] = useState<Record<string, unknown>[]>([]);
  const [circleName, setCircleName] = useState("Близкие");
  const [circleColor, setCircleColor] = useState("#a855f7");
  const [activeCircleId, setActiveCircleId] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    api.getCircles().then((data) => {
      setCircles(data as Record<string, unknown>[]);
      const first = (data as Record<string, unknown>[])[0];
      if (first) setActiveCircleId(String(first.id));
    }).catch(() => setCircles([]));
  }, []);

  useEffect(() => {
    if (memberQuery.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchUsers(memberQuery).then((data) => setMemberResults(data as Record<string, unknown>[])).catch(() => setMemberResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [memberQuery]);

  async function togglePrivacy() {
    const next = !hideSocial;
    setHideSocial(next);
    setSaving(true);
    try {
      const updated = await api.updateProfile({ hideSocial: next });
      updateUser({ hideSocial: updated.hideSocial });
      setNotice(next ? "Список друзей и каналов скрыт" : "Список друзей и каналов открыт");
    } catch {
      setHideSocial(!next);
      setNotice("Не удалось сохранить настройку");
    } finally {
      setSaving(false);
      window.setTimeout(() => setNotice(null), 2200);
    }
  }

  async function togglePurchasesPrivacy() {
    const next = !hidePurchases;
    setHidePurchases(next);
    setSaving(true);
    try {
      const updated = await api.updateProfile({ hidePurchases: next });
      updateUser({ hidePurchases: updated.hidePurchases });
      setNotice(next ? "Покупки скрыты от других" : "Покупки видны в профиле");
    } catch {
      setHidePurchases(!next);
      setNotice("Не удалось сохранить настройку покупок");
    } finally {
      setSaving(false);
      window.setTimeout(() => setNotice(null), 2200);
    }
  }

  async function createCircle() {
    if (!circleName.trim()) return;
    setSaving(true);
    try {
      const circle = await api.createCircle({ name: circleName.trim(), color: circleColor }) as Record<string, unknown>;
      setCircles((prev) => [...prev, circle]);
      setActiveCircleId(String(circle.id));
      setNotice("Круг создан");
    } catch {
      setNotice("Не удалось создать круг. Проверь миграцию private_circles.");
    } finally {
      setSaving(false);
      window.setTimeout(() => setNotice(null), 2400);
    }
  }

  async function deleteCircle(id: string) {
    setSaving(true);
    try {
      await api.deleteCircle(id);
      setCircles((prev) => prev.filter((circle) => String(circle.id) !== id));
      if (activeCircleId === id) setActiveCircleId(null);
    } catch {}
    setSaving(false);
  }

  async function addMember(userId: string) {
    if (!activeCircleId) return;
    setSaving(true);
    try {
      await api.addCircleMember(activeCircleId, userId);
      const userToAdd = memberResults.find((u) => String(u.id) === userId);
      setCircles((prev) => prev.map((circle) => {
        if (String(circle.id) !== activeCircleId) return circle;
        const members = Array.isArray(circle.members) ? circle.members as Record<string, unknown>[] : [];
        if (members.some((m) => String(m.id) === userId)) return circle;
        return { ...circle, members: [...members, userToAdd].filter(Boolean) };
      }));
      setMemberQuery("");
      setMemberResults([]);
    } catch {}
    setSaving(false);
  }

  async function removeMember(userId: string) {
    if (!activeCircleId) return;
    await api.removeCircleMember(activeCircleId, userId).catch(() => {});
    setCircles((prev) => prev.map((circle) => String(circle.id) === activeCircleId
      ? { ...circle, members: (Array.isArray(circle.members) ? circle.members as Record<string, unknown>[] : []).filter((m) => String(m.id) !== userId) }
      : circle));
  }

  const activeCircle = activeCircleId ? circles.find((circle) => String(circle.id) === activeCircleId) ?? null : null;
  const activeMembers = activeCircle && Array.isArray(activeCircle.members) ? activeCircle.members as Record<string, unknown>[] : [];

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-4">
      <SectionTitleInline icon={UsersRound} title="Социальное" desc="Списки друзей и каналов теперь отображаются в профиле" />
      {notice && <div className="rounded-2xl glass px-3 py-2 text-xs text-white/60">{notice}</div>}
      <div className="rounded-2xl glass p-4 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgb(var(--accent-main-rgb) / 0.15)" }}>
          <Shield size={19} className="text-neon-purple" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Скрыть друзей и подписанные каналы</div>
          <div className="text-xs text-white/45 mt-0.5">Если включено, другие пользователи не увидят эти списки в твоём профиле.</div>
        </div>
        <button onClick={togglePrivacy} disabled={saving} className={hideSocial ? "btn-glow px-4 py-2 text-sm" : "btn-ghost px-4 py-2 text-sm"}>
          {saving ? "…" : hideSocial ? "Скрыто" : "Открыто"}
        </button>
      </div>

      <div className="rounded-2xl glass p-4 flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgb(var(--accent-main-rgb) / 0.15)" }}>
          <ShoppingBag size={19} className="text-neon-purple" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Скрыть купленные товары</div>
          <div className="text-xs text-white/45 mt-0.5">Если включено, другие пользователи не увидят вкладку «Купленное» и коллекцию в комнате профиля.</div>
        </div>
        <button onClick={togglePurchasesPrivacy} disabled={saving} className={hidePurchases ? "btn-glow px-4 py-2 text-sm" : "btn-ghost px-4 py-2 text-sm"}>
          {saving ? "…" : hidePurchases ? "Скрыто" : "Открыто"}
        </button>
      </div>

      <div className="rounded-3xl glass p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgb(var(--accent-main-rgb) / 0.15)" }}>
            <UsersRound size={19} className="text-neon-purple" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Private Circles</div>
            <div className="text-xs text-white/45">Близкие, команда, приват — подготовка к постам/сторис только для выбранного круга.</div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_170px_auto]">
          <input value={circleName} onChange={(e) => setCircleName(e.target.value)} className="ng-input py-2.5 text-sm" placeholder="Название круга" />
          <CustomSelect
            value={circleColor}
            onChange={setCircleColor}
            buttonClassName="py-2.5 text-xs"
            options={NAME_COLORS.slice(0, 12).map((preset) => ({ value: preset.color, label: `${preset.emoji} ${preset.label}`, description: preset.color }))}
          />
          <button onClick={createCircle} disabled={saving || !circleName.trim()} className="btn-glow px-4 py-2.5 text-sm disabled:opacity-50"><Plus size={14} className="inline mr-1" />Создать</button>
        </div>

        {circles.length > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {circles.map((circle) => {
              const id = String(circle.id);
              const active = id === activeCircleId;
              const color = String(circle.color ?? "#a855f7");
              return (
                <button key={id} onClick={() => setActiveCircleId(id)} className={active ? "rounded-2xl px-3 py-2 text-xs font-semibold text-white shadow-glow" : "rounded-2xl glass px-3 py-2 text-xs text-white/55"} style={active ? { background: `${color}33`, border: `1px solid ${color}66` } : undefined}>
                  {String(circle.name)} · {(Array.isArray(circle.members) ? circle.members.length : 0)}
                </button>
              );
            })}
          </div>
        )}

        {activeCircle && (
          <div className="rounded-3xl bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex-1 text-sm font-semibold" style={{ color: String(activeCircle.color ?? "#a855f7") }}>{String(activeCircle.name)}</div>
              <button onClick={() => deleteCircle(String(activeCircle.id))} className="grid h-8 w-8 place-items-center rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/15"><Trash2 size={14} /></button>
            </div>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
              <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} className="ng-input py-2.5 pl-8 text-sm" placeholder="Добавить пользователя…" />
            </div>
            {memberResults.length > 0 && (
              <div className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-2xl glass p-2">
                {memberResults.map((u) => (
                  <button key={String(u.id)} onClick={() => addMember(String(u.id))} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/5">
                    <GlowAvatar src={(u.avatarUrl as string) ?? (u.avatar_url as string) ?? null} alt={String(u.username ?? "")} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm">@{String(u.username ?? "")}</span>
                    <Plus size={13} className="text-neon-purple" />
                  </button>
                ))}
              </div>
            )}
            {activeMembers.length === 0 ? (
              <div className="py-5 text-center text-xs text-white/35">В круге пока никого нет</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {activeMembers.map((m) => (
                  <span key={String(m.id)} className="inline-flex items-center gap-2 rounded-full glass px-2 py-1 text-xs text-white/65">
                    @{String(m.username ?? "")}
                    <button onClick={() => removeMember(String(m.id))} className="text-white/35 hover:text-red-300"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-white/40">Открой свой профиль и нажми на цифры «Друзья» или «Каналы», чтобы увидеть списки. Private Circles уже готовы для следующего шага — видимость постов/сторис по кругам.</p>
    </div>
  );
}

function PrivacySection() {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Record<string, unknown>[]>([]);
  const [settings, setSettings] = useState({
    privacyProfile: (user?.privacyProfile ?? "everyone") as PrivacyAudience,
    privacyMessages: (user?.privacyMessages ?? "everyone") as PrivacyAudience,
    privacyGroups: (user?.privacyGroups ?? "everyone") as PrivacyAudience,
    privacyLastSeen: (user?.privacyLastSeen ?? "everyone") as PrivacyAudience,
    hideReadReceipts: Boolean(user?.hideReadReceipts),
    filterUnknownMessages: user?.filterUnknownMessages !== false,
  });

  useEffect(() => {
    api.getSocial().then((data) => setBlocked((data.blocked || []) as Record<string, unknown>[])).catch(() => setBlocked([]));
  }, []);

  const audienceOptions = [
    { value: "everyone", label: "Все", description: "Без дополнительных ограничений" },
    { value: "following", label: "Подписчики и друзья", description: "Люди, которые подписаны на тебя" },
    { value: "friends", label: "Только друзья", description: "Взаимная подписка" },
    { value: "nobody", label: "Никто", description: "Только ты" },
  ];

  async function saveSetting<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    const previous = settings[key];
    setSettings((current) => ({ ...current, [key]: value }));
    setSaving(String(key));
    try {
      const updated = await api.updateProfile({ [key]: value });
      updateUser({ [key]: updated[key] } as Partial<User>);
      setNotice("Настройка приватности сохранена");
    } catch {
      setSettings((current) => ({ ...current, [key]: previous }));
      setNotice("Не удалось сохранить настройку. Проверь migration_privacy_safety.sql");
    } finally {
      setSaving(null);
      window.setTimeout(() => setNotice(null), 2500);
    }
  }

  async function unblock(userId: string) {
    try {
      await api.socialAction("block", userId);
      setBlocked((items) => items.filter((item) => String(item.id) !== userId));
      setNotice("Пользователь удалён из чёрного списка");
    } catch {
      setNotice("Не удалось изменить чёрный список");
    } finally {
      window.setTimeout(() => setNotice(null), 2200);
    }
  }

  const rows: { key: "privacyProfile" | "privacyMessages" | "privacyGroups" | "privacyLastSeen"; title: string; desc: string; icon: LucideIcon }[] = [
    { key: "privacyProfile", title: "Кто видит полный профиль", desc: "Стена, публикации, подарки и социальные списки", icon: Eye },
    { key: "privacyMessages", title: "Кто может написать первым", desc: "Действующие диалоги остаются доступными, пока нет блокировки", icon: MessageCircle },
    { key: "privacyGroups", title: "Кто может добавлять в группы", desc: "Владельцы и администраторы увидят понятную ошибку", icon: UsersRound },
    { key: "privacyLastSeen", title: "Кто видит онлайн и время посещения", desc: "Для остальных статус будет скрыт", icon: MonitorSmartphone },
  ];

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-4">
      <SectionTitleInline icon={EyeOff} title="Приватность" desc="Управляй доступом к профилю, сообщениям и статусу" />
      {notice && <div className="rounded-2xl glass px-3 py-2 text-xs text-white/65">{notice}</div>}
      <div className="grid gap-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.key} className="grid gap-3 rounded-3xl glass p-4 sm:grid-cols-[1fr_220px] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neon-purple/10 text-neon-purple"><Icon size={18} /></div>
                <div className="min-w-0"><div className="text-sm font-semibold">{row.title}</div><div className="mt-0.5 text-xs text-white/42">{row.desc}</div></div>
              </div>
              <CustomSelect value={settings[row.key]} onChange={(value) => void saveSetting(row.key, value as PrivacyAudience)} options={audienceOptions} buttonClassName="py-2.5 text-xs" />
            </div>
          );
        })}
      </div>
      <div className="rounded-3xl glass p-4 space-y-3">
        <div className="flex items-center gap-4">
          <div className="flex-1"><div className="text-sm font-semibold">Скрывать отметку о прочтении</div><div className="mt-0.5 text-xs text-white/42">Собеседники не увидят, что ты прочитал сообщение. Статус доставки сохранится.</div></div>
          <Toggle on={settings.hideReadReceipts} onClick={() => void saveSetting("hideReadReceipts", !settings.hideReadReceipts)} />
        </div>
        <div className="h-px bg-white/5" />
        <div className="flex items-center gap-4">
          <div className="flex-1"><div className="text-sm font-semibold">Запросы от незнакомых</div><div className="mt-0.5 text-xs text-white/42">Новые сообщения от незнакомых сначала попадают в запросы.</div></div>
          <Toggle on={settings.filterUnknownMessages} onClick={() => void saveSetting("filterUnknownMessages", !settings.filterUnknownMessages)} />
        </div>
      </div>
      <div className="rounded-3xl glass p-4 space-y-3">
        <div className="flex items-center gap-3"><UserX size={18} className="text-red-300" /><div><div className="text-sm font-semibold">Чёрный список</div><div className="text-xs text-white/42">Заблокированные не могут написать, подписаться или добавить тебя в группу.</div></div></div>
        {blocked.length === 0 ? <div className="rounded-2xl bg-white/[0.025] px-3 py-5 text-center text-xs text-white/35">Чёрный список пуст</div> : (
          <div className="space-y-2">
            {blocked.map((item) => (
              <div key={String(item.id)} className="flex items-center gap-3 rounded-2xl bg-white/[0.025] px-3 py-2.5">
                <GlowAvatar src={(item.avatarUrl as string) ?? (item.avatar_url as string) ?? null} alt={String(item.username ?? "")} size={36} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{String(item.displayName ?? item.display_name ?? item.username ?? "Пользователь")}</div><div className="truncate text-[11px] text-white/40">@{String(item.username ?? "")}</div></div>
                <button onClick={() => void unblock(String(item.id))} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/65 hover:border-red-400/30 hover:text-red-200">Разблокировать</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {saving && <div className="flex items-center gap-2 text-xs text-white/35"><Loader2 size={13} className="animate-spin" />Сохраняем…</div>}
    </div>
  );
}

// =============================================================================
//  Security section
// =============================================================================

function SecuritySection() {
  const { user, updateUser } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AuthDeviceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<{ challengeToken: string; action: "enable" | "disable" | "regenerate"; setup?: { issuer: string; accountLabel: string; secret: string; otpauthUrl: string } | null } | null>(null);
  const [twoFactorQr, setTwoFactorQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [recovery, setRecovery] = useState<TwoFactorRecoveryRequest | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [securityLoading, setSecurityLoading] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);

  async function loadSessions() {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      setSessions(await api.getAuthSessions());
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось загрузить устройства";
      setSessionsError(text);
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadRecovery() {
    try {
      setRecovery(await api.getTwoFactorRecovery());
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось проверить восстановление";
      if (!text.includes("migration_account_recovery")) setSecurityError(text);
    }
  }

  async function loadSecurityEvents() {
    setSecurityLoading(true);
    setSecurityError(null);
    try {
      setSecurityEvents(await api.getSecurityEvents(40));
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Не удалось загрузить журнал безопасности");
    } finally {
      setSecurityLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
    void loadRecovery();
    void loadSecurityEvents();
  }, []);

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 3000);
  }

  async function saveEmail() {
    if (!email.trim() || !emailPassword.trim()) return notify("Укажи новую почту и текущий пароль");
    setSaving("email");
    try {
      const updated = await api.changeEmail(email.trim(), emailPassword);
      updateUser({ email: updated.email });
      setEmailPassword("");
      notify("Почта обновлена");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось сменить почту: проверь пароль");
    } finally { setSaving(null); }
  }

  async function savePassword() {
    if (!currentPassword || newPassword.length < 8) return notify("Новый пароль минимум 8 символов");
    setSaving("password");
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword("");
      notify("Пароль обновлён. Остальные устройства отключены.");
      void loadSessions();
    } catch { notify("Не удалось сменить пароль: проверь текущий пароль"); }
    finally { setSaving(null); }
  }

  async function requestTwoFactorAction(action: "enable" | "disable" | "regenerate") {
    if (!twoFactorPassword) return notify("Введите текущий пароль");
    setSaving(`2fa:${action}`);
    setBackupCodes([]);
    try {
      const challenge = await api.requestTwoFactorAction(action, twoFactorPassword);
      setTwoFactorChallenge(challenge);
      setTwoFactorCode("");
      setTwoFactorQr(null);
      if (challenge.setup?.otpauthUrl) {
        const QRCode = (await import("qrcode")).default;
        setTwoFactorQr(await QRCode.toDataURL(challenge.setup.otpauthUrl, { width: 240, margin: 1, errorCorrectionLevel: "M" }));
        notify("QR-код создан. Отсканируй его приложением-аутентификатором.");
      } else {
        notify("Подтверди действие кодом из приложения-аутентификатора");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось отправить код");
    } finally {
      setSaving(null);
    }
  }

  async function confirmTwoFactorAction() {
    if (!twoFactorChallenge || !twoFactorCode.trim()) return notify("Введите код из приложения-аутентификатора");
    setSaving("2fa:confirm");
    try {
      const result = await api.confirmTwoFactorAction(twoFactorChallenge.challengeToken, twoFactorCode.trim());
      updateUser({
        twoFactorEnabled: result.enabled,
        twoFactorBackupCodesRemaining: result.enabled ? (result.backupCodes?.length ?? user?.twoFactorBackupCodesRemaining ?? 0) : 0,
      });
      setBackupCodes(result.backupCodes || []);
      setTwoFactorChallenge(null);
      setTwoFactorQr(null);
      setTwoFactorCode("");
      setTwoFactorPassword("");
      notify(result.enabled ? "Двухэтапная защита включена" : "Двухэтапная защита отключена");
      void loadSessions();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Неверный или просроченный код");
    } finally {
      setSaving(null);
    }
  }

  async function copyBackupCodes() {
    if (!backupCodes.length) return;
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    notify("Резервные коды скопированы");
  }

  async function requestRecovery() {
    if (!recoveryPassword) return notify("Введите текущий пароль");
    setSaving("2fa:recovery-request");
    try {
      const result = await api.requestTwoFactorRecovery(recoveryPassword);
      setRecovery(result.recovery);
      setRecoveryPassword("");
      notify("Запрос создан. Остальные устройства отключены.");
      void loadSessions();
      void loadSecurityEvents();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось создать запрос восстановления");
    } finally { setSaving(null); }
  }

  async function cancelRecovery() {
    if (!recoveryPassword) return notify("Введите текущий пароль");
    setSaving("2fa:recovery-cancel");
    try {
      await api.cancelTwoFactorRecovery(recoveryPassword);
      setRecovery(null);
      setRecoveryPassword("");
      notify("Восстановление 2FA отменено");
      void loadSecurityEvents();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось отменить восстановление");
    } finally { setSaving(null); }
  }

  async function completeRecovery() {
    if (!recoveryPassword) return notify("Введите текущий пароль");
    setSaving("2fa:recovery-complete");
    try {
      await api.completeTwoFactorRecovery(recoveryPassword);
      updateUser({ twoFactorEnabled: false, twoFactorBackupCodesRemaining: 0 });
      setRecovery(null);
      setRecoveryPassword("");
      notify("Двухэтапная защита отключена через восстановление");
      void loadSecurityEvents();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось завершить восстановление");
    } finally { setSaving(null); }
  }

  function securityEventTitle(type: string) {
    const labels: Record<string, string> = {
      account_registered: "Аккаунт создан",
      login_success: "Успешный вход",
      login_failed: "Неудачная попытка входа",
      password_changed: "Пароль изменён",
      email_changed: "Почта изменена",
      two_factor_enabled: "2FA включена",
      two_factor_disabled: "2FA отключена",
      two_factor_backup_codes_regenerated: "Резервные коды обновлены",
      two_factor_code_failed: "Неверный код двухэтапной защиты",
      two_factor_recovery_requested: "Запрошено восстановление 2FA",
      two_factor_recovery_cancelled: "Восстановление 2FA отменено",
      two_factor_recovery_completed: "2FA отключена через восстановление",
      session_revoked: "Устройство отключено",
      other_sessions_revoked: "Остальные устройства отключены",
      account_deletion_requested: "Запрошено удаление аккаунта",
      account_deletion_cancelled: "Удаление аккаунта отменено",
      data_exported: "Создан экспорт данных",
    };
    return labels[type] || type.replaceAll("_", " ");
  }

  async function exportAccountData() {
    if (!exportPassword) return notify("Введите пароль для экспорта");
    setSaving("export");
    try {
      const data = await api.exportAccountData(exportPassword);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nightgram-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportPassword("");
      notify("Экспорт данных создан");
      void loadSecurityEvents();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Не удалось создать экспорт");
    } finally { setSaving(null); }
  }

  async function requestDelete() {
    if (!deletePassword) return notify("Введите пароль для подтверждения");
    setSaving("delete");
    try {
      const updated = await api.requestAccountDeletion(deletePassword);
      updateUser({ deletionRequestedAt: updated.deletionRequestedAt, deletionScheduledAt: updated.deletionScheduledAt });
      setDeletePassword("");
      notify("Удаление аккаунта запланировано. У тебя есть 24 часа, чтобы отменить.");
    } catch { notify("Не удалось запланировать удаление: проверь пароль и миграции"); }
    finally { setSaving(null); }
  }

  async function cancelDelete() {
    if (!deletePassword) return notify("Введите пароль для отмены удаления");
    setSaving("cancelDelete");
    try {
      const updated = await api.cancelAccountDeletion(deletePassword);
      updateUser({ deletionRequestedAt: updated.deletionRequestedAt, deletionScheduledAt: updated.deletionScheduledAt });
      setDeletePassword("");
      notify("Удаление аккаунта отменено");
    } catch { notify("Не удалось отменить: проверь пароль"); }
    finally { setSaving(null); }
  }

  async function terminateSession(session: AuthDeviceSession) {
    if (session.current) return;
    setSaving(`session:${session.id}`);
    try {
      await api.revokeAuthSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      notify("Устройство отключено");
    } catch {
      notify("Не удалось отключить устройство");
    } finally {
      setSaving(null);
    }
  }

  async function terminateOtherSessions() {
    setSaving("sessions:others");
    try {
      await api.revokeOtherAuthSessions();
      setSessions((current) => current.filter((item) => item.current));
      notify("Все остальные устройства отключены");
    } catch {
      notify("Не удалось завершить другие сессии");
    } finally {
      setSaving(null);
    }
  }

  function sessionTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "неизвестно" : date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-4">
      <SectionTitle icon={Shield} title="Безопасность" desc="Почта, пароль и удаление аккаунта" />
      {message && <div className="rounded-2xl glass px-3 py-2 text-xs text-white/65">{message}</div>}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-3xl glass p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AtSign size={16} className="text-neon-purple" />
            <div>
              <div className="font-semibold text-sm">Смена почты</div>
              <div className="text-xs text-white/45">Нужен текущий пароль</div>
            </div>
          </div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@email.com" className="ng-input" />
          <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} placeholder="Текущий пароль" className="ng-input" />
          <button onClick={saveEmail} disabled={saving === "email"} className="btn-glow w-full py-2.5 text-sm disabled:opacity-50">
            {saving === "email" ? "Сохраняем…" : "Сменить почту"}
          </button>
        </div>

        <div className="rounded-3xl glass p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-neon-purple" />
            <div>
              <div className="font-semibold text-sm">Смена пароля</div>
              <div className="text-xs text-white/45">Минимум 8 символов</div>
            </div>
          </div>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Текущий пароль" className="ng-input" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Новый пароль" className="ng-input" />
          <button onClick={savePassword} disabled={saving === "password"} className="btn-glow w-full py-2.5 text-sm disabled:opacity-50">
            {saving === "password" ? "Сохраняем…" : "Сменить пароль"}
          </button>
        </div>
      </div>

      <div className="rounded-3xl glass p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn("grid h-10 w-10 place-items-center rounded-xl", user?.twoFactorEnabled ? "bg-emerald-500/12 text-emerald-300" : "bg-neon-purple/10 text-neon-purple")}>
              {user?.twoFactorEnabled ? <CheckCircle2 size={19} /> : <KeyRound size={19} />}
            </div>
            <div>
              <div className="font-semibold text-sm">Двухэтапная защита</div>
              <div className="text-xs text-white/45">Код создаётся на телефоне и работает без почты, SMS и домена</div>
            </div>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", user?.twoFactorEnabled ? "bg-emerald-500/12 text-emerald-300" : "bg-white/5 text-white/45")}>
            {user?.twoFactorEnabled ? "Включена" : "Выключена"}
          </span>
        </div>

        {!twoFactorChallenge ? (
          <div className="space-y-3">
            <input type="password" value={twoFactorPassword} onChange={(e) => setTwoFactorPassword(e.target.value)} placeholder="Текущий пароль" className="ng-input" />
            <div className="flex flex-wrap gap-2">
              {!user?.twoFactorEnabled ? (
                <button onClick={() => void requestTwoFactorAction("enable")} disabled={saving === "2fa:enable"} className="btn-glow px-4 py-2.5 text-sm disabled:opacity-50">
                  {saving === "2fa:enable" ? "Создаём QR-код…" : "Настроить приложение"}
                </button>
              ) : (
                <>
                  <button onClick={() => void requestTwoFactorAction("regenerate")} disabled={saving === "2fa:regenerate"} className="btn-ghost px-4 py-2.5 text-sm disabled:opacity-50">
                    Новые резервные коды
                  </button>
                  <button onClick={() => void requestTwoFactorAction("disable")} disabled={saving === "2fa:disable"} className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-50">
                    Отключить
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-neon-purple/20 bg-neon-purple/5 p-4">
            {twoFactorChallenge.action === "enable" && twoFactorChallenge.setup ? (
              <>
                <div className="flex items-start gap-3">
                  <QrCode size={19} className="mt-0.5 shrink-0 text-neon-purple" />
                  <div><div className="text-sm font-semibold">Отсканируй QR-код</div><div className="text-xs text-white/50">Открой выбранное приложение, нажми «Добавить» или «+» и отсканируй код.</div></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                  <div className="grid h-[210px] w-[210px] place-items-center rounded-2xl bg-white p-2">
                    {twoFactorQr ? <img src={twoFactorQr} alt="QR-код NightGram для приложения-аутентификатора" className="h-full w-full" /> : <Loader2 size={28} className="animate-spin text-black" />}
                  </div>
                  <div className="space-y-2 text-xs text-white/55">
                    <div>Аккаунт: <span className="font-semibold text-white">{twoFactorChallenge.setup.accountLabel}</span></div>
                    <div>Не получается сканировать? Введи секрет вручную:</div>
                    <code className="block break-all rounded-xl bg-black/25 px-3 py-2 font-mono text-amber-100">{twoFactorChallenge.setup.secret}</code>
                    <div className="text-amber-100/80">Не отправляй QR-код или секрет другим людям.</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-white/55">Введи текущий код из приложения-аутентификатора или одноразовый резервный код.</div>
            )}
            <input type="text" inputMode="numeric" autoComplete="one-time-code" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.toUpperCase().slice(0, 16))} placeholder="000000" className="ng-input font-mono tracking-[0.18em]" />
            <div className="flex gap-2">
              <button onClick={() => void confirmTwoFactorAction()} disabled={saving === "2fa:confirm"} className="btn-glow px-4 py-2.5 text-sm disabled:opacity-50">
                {saving === "2fa:confirm" ? "Проверяем…" : twoFactorChallenge.action === "enable" ? "Подтвердить и включить" : "Подтвердить"}
              </button>
              <button onClick={() => { setTwoFactorChallenge(null); setTwoFactorQr(null); setTwoFactorCode(""); }} className="btn-ghost px-4 py-2.5 text-sm">Отмена</button>
            </div>
          </div>
        )}

        {backupCodes.length > 0 && (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-3 space-y-3">
            <div className="text-sm font-semibold text-amber-100">Сохрани резервные коды</div>
            <div className="text-xs text-white/50">Каждый код работает один раз. Они больше не будут показаны после закрытия этой страницы.</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {backupCodes.map((item) => <code key={item} className="rounded-xl bg-black/25 px-3 py-2 text-center text-xs text-amber-100">{item}</code>)}
            </div>
            <button onClick={() => void copyBackupCodes()} className="btn-ghost px-3 py-2 text-xs"><Copy size={13} /> Скопировать все</button>
          </div>
        )}

        {user?.twoFactorEnabled && Number(user.twoFactorBackupCodesRemaining ?? 0) <= 2 && (
          <div className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/8 p-3 text-xs text-amber-100">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            <div><div className="font-semibold">Резервные коды заканчиваются</div><div className="mt-0.5 text-amber-100/70">Осталось: {Number(user.twoFactorBackupCodesRemaining ?? 0)}. Создай новый комплект и сохрани его отдельно.</div></div>
          </div>
        )}

        {user?.twoFactorEnabled && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Clock3 size={17} className="mt-0.5 shrink-0 text-amber-200" />
              <div><div className="text-sm font-semibold text-amber-100">Потерял доступ к приложению?</div><div className="text-xs text-white/48">Восстановление доступно только с устройством, где вход выполнен не менее 24 часов назад. После запроса действует ещё 24 часа ожидания.</div></div>
            </div>
            {recovery ? (
              <div className="rounded-xl bg-black/20 p-3 text-xs text-white/55">
                <div>Запрос создан: {sessionTime(recovery.requestedAt)}</div>
                <div className="mt-1">Сброс станет доступен: <span className="font-semibold text-amber-100">{sessionTime(recovery.availableAt)}</span></div>
                <div className="mt-1">Статус: {!recovery.canComplete ? <span className="text-amber-200">завершение только на устройстве, создавшем запрос</span> : recovery.ready ? <span className="text-emerald-300">можно завершить</span> : <span className="text-amber-200">период ожидания</span>}</div>
              </div>
            ) : (
              <div className="text-[11px] text-white/38">Запрос немедленно отключит все остальные устройства. Отменить его можно с текущего устройства.</div>
            )}
            <input type="password" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} placeholder="Текущий пароль" className="ng-input" />
            <div className="flex flex-wrap gap-2">
              {!recovery ? (
                <button onClick={() => void requestRecovery()} disabled={saving === "2fa:recovery-request"} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-100 hover:bg-amber-400/15 disabled:opacity-50">
                  {saving === "2fa:recovery-request" ? "Создаём запрос…" : "Запросить восстановление"}
                </button>
              ) : (
                <>
                  {recovery.ready && recovery.canComplete && <button onClick={() => void completeRecovery()} disabled={saving === "2fa:recovery-complete"} className="rounded-xl border border-red-500/35 bg-red-500/12 px-4 py-2.5 text-sm text-red-100 hover:bg-red-500/20 disabled:opacity-50">{saving === "2fa:recovery-complete" ? "Отключаем…" : "Отключить 2FA"}</button>}
                  <button onClick={() => void cancelRecovery()} disabled={saving === "2fa:recovery-cancel"} className="btn-ghost px-4 py-2.5 text-sm disabled:opacity-50">Отменить запрос</button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/8 bg-black/10 p-3 space-y-3">
          <div className="flex items-start gap-2"><Smartphone size={17} className="mt-0.5 shrink-0 text-neon-purple" /><div><div className="text-sm font-semibold">Нужно приложение-аутентификатор</div><div className="text-xs text-white/45">Установи одно приложение на телефон до включения защиты. Оно создаёт коды офлайн примерно каждые 30 секунд.</div></div></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { name: "2FAS", note: "Рекомендуем большинству: бесплатно, открытый код, Android и iPhone, резервное копирование.", href: "https://2fas.com/" },
              { name: "Aegis", note: "Лучший вариант для приватности на Android: зашифрованное хранилище и резервные копии.", href: "https://getaegis.app/" },
              { name: "Microsoft Authenticator", note: "Удобно пользователям Microsoft; поддерживает резервное восстановление.", href: "https://www.microsoft.com/security/mobile-authenticator-app" },
              { name: "Google Authenticator", note: "Самый простой и знакомый вариант для Android и iPhone с синхронизацией кодов.", href: "https://support.google.com/accounts/answer/1066447" },
            ].map((app) => (
              <a key={app.name} href={app.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-white/8 bg-white/[0.025] p-3 transition hover:border-neon-purple/35 hover:bg-neon-purple/5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-white"><span>{app.name}</span><ExternalLink size={13} className="text-white/35 group-hover:text-neon-purple" /></div>
                <div className="mt-1 text-[11px] leading-relaxed text-white/42">{app.note}</div>
              </a>
            ))}
          </div>
          <div className="text-[11px] text-amber-100/75">Обязательно включи резервное копирование в выбранном приложении и сохрани резервные коды NightGram отдельно. Потеря телефона без резервной копии может закрыть доступ к аккаунту.</div>
        </div>
      </div>

      <div className="rounded-3xl glass p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MonitorSmartphone size={17} className="text-neon-purple" />
            <div>
              <div className="font-semibold text-sm">Активные устройства</div>
              <div className="text-xs text-white/45">Завершай входы, которые больше не используешь</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void loadSessions()} disabled={sessionsLoading} className="btn-ghost px-3 py-2 text-xs disabled:opacity-50">
              <RefreshCw size={13} className={sessionsLoading ? "animate-spin" : ""} /> Обновить
            </button>
            {sessions.some((session) => !session.current) && (
              <button onClick={terminateOtherSessions} disabled={saving === "sessions:others"} className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-50">
                <LogOut size={13} /> {saving === "sessions:others" ? "Отключаем…" : "Отключить остальные"}
              </button>
            )}
          </div>
        </div>

        {sessionsError ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            {sessionsError.includes("migration_auth_sessions") ? "Сначала выполни migration_auth_sessions.sql в Supabase." : sessionsError}
          </div>
        ) : sessionsLoading && sessions.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-xs text-white/45"><Loader2 size={14} className="animate-spin" /> Загружаем устройства…</div>
        ) : sessions.length === 0 ? (
          <div className="py-4 text-xs text-white/45">Активные устройства появятся после следующего входа.</div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className={cn("flex items-center gap-3 rounded-2xl border px-3 py-3", session.current ? "border-neon-purple/35 bg-neon-purple/5" : "border-white/8 bg-black/10")}>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-white/65"><MonitorSmartphone size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{session.deviceName}</span>
                    {session.current && <span className="rounded-full bg-neon-purple/15 px-2 py-0.5 text-[10px] text-neon-purple">Это устройство</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/40">
                    Последняя активность: {sessionTime(session.lastSeenAt)}{session.ipAddress ? ` · ${session.ipAddress}` : ""}
                  </div>
                </div>
                {!session.current && (
                  <button onClick={() => void terminateSession(session)} disabled={saving === `session:${session.id}`} className="rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2 text-xs text-red-200 hover:bg-red-500/15 disabled:opacity-50">
                    {saving === `session:${session.id}` ? "…" : "Отключить"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-white/35">После отключения устройство потеряет возможность обновить токен. Уже открытый экран может оставаться активным до 15 минут.</div>
      </div>

      <div className="rounded-3xl glass p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><History size={17} className="text-neon-purple" /><div><div className="font-semibold text-sm">Журнал безопасности</div><div className="text-xs text-white/45">Входы и важные изменения аккаунта</div></div></div>
          <button onClick={() => void loadSecurityEvents()} disabled={securityLoading} className="btn-ghost px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={13} className={securityLoading ? "animate-spin" : ""} /> Обновить</button>
        </div>
        {securityError ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">{securityError.includes("migration_account_recovery") ? "Сначала выполни migration_account_recovery_security_log.sql в Supabase." : securityError}</div>
        ) : securityLoading && securityEvents.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-xs text-white/45"><Loader2 size={14} className="animate-spin" /> Загружаем события…</div>
        ) : securityEvents.length === 0 ? (
          <div className="py-4 text-xs text-white/45">События появятся после следующего входа или изменения настроек безопасности.</div>
        ) : (
          <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {securityEvents.map((event) => (
              <div key={event.id} className={cn("flex items-start gap-3 rounded-2xl border px-3 py-3", event.success ? "border-white/8 bg-black/10" : "border-red-500/25 bg-red-500/5")}>
                <div className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", event.success ? "bg-neon-purple/10 text-neon-purple" : "bg-red-500/10 text-red-300")}><Shield size={15} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{securityEventTitle(event.eventType)}</div>
                  <div className="mt-0.5 text-[11px] text-white/40">{sessionTime(event.createdAt)}{event.deviceName ? ` · ${event.deviceName}` : ""}{event.ipAddress ? ` · ${event.ipAddress}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-3xl glass p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Download size={17} className="mt-0.5 shrink-0 text-neon-purple" />
          <div><div className="font-semibold text-sm">Экспорт личных данных</div><div className="text-xs text-white/45">JSON-файл с профилем, твоими сообщениями, публикациями, комментариями, связями, сессиями и журналом безопасности.</div></div>
        </div>
        <div className="text-[11px] text-white/35">Для защиты экспорт можно создавать не чаще двух раз в сутки. В файл не попадают пароль, TOTP-секрет и хэши резервных кодов.</div>
        <input type="password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} placeholder="Текущий пароль" className="ng-input" />
        <button onClick={() => void exportAccountData()} disabled={saving === "export"} className="btn-ghost px-4 py-2.5 text-sm disabled:opacity-50">
          <Download size={14} /> {saving === "export" ? "Собираем данные…" : "Скачать мои данные"}
        </button>
      </div>

      <div className="rounded-3xl border border-red-500/25 bg-red-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-red-300" />
          <div>
            <div className="font-semibold text-sm text-red-200">Удаление аккаунта</div>
            <div className="text-xs text-white/45">После запроса есть 24 часа, чтобы передумать. Для отмены тоже нужен пароль.</div>
          </div>
        </div>
        {user?.deletionScheduledAt && (
          <div className="rounded-2xl glass px-3 py-2 text-xs text-red-200">
            Удаление запланировано до {new Date(user.deletionScheduledAt).toLocaleString("ru-RU")}
          </div>
        )}
        <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Пароль" className="ng-input" />
        <div className="flex flex-wrap gap-2">
          <button onClick={requestDelete} disabled={saving === "delete"} className="rounded-xl bg-red-500/20 border border-red-500/40 px-4 py-2.5 text-sm text-red-200 hover:bg-red-500/30 transition disabled:opacity-50">
            {saving === "delete" ? "…" : "Запланировать удаление"}
          </button>
          {user?.deletionScheduledAt && (
            <button onClick={cancelDelete} disabled={saving === "cancelDelete"} className="btn-ghost px-4 py-2.5 text-sm disabled:opacity-50">
              {saving === "cancelDelete" ? "…" : "Передумал, отменить"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
//  Notifications section
// =============================================================================

function NotificationsSection() {
  const { user, updateUser } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(() => normalizeNotificationSettings(user?.notificationSettings));
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [pushState, setPushState] = useState<WebPushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    setSettings(normalizeNotificationSettings(user?.notificationSettings));
  }, [user?.id, user?.notificationSettings]);

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    void getWebPushState().then((state) => {
      setPushState(state);
      setPermission(state.permission);
    }).catch(() => {});
  }, []);

  type BooleanKey = {
    [K in keyof NotificationSettings]: NotificationSettings[K] extends boolean ? K : never
  }[keyof NotificationSettings];

  const chatItems: { key: BooleanKey; label: string; desc: string }[] = [
    { key: "messages", label: "Сообщения", desc: "Главный переключатель уведомлений из чатов" },
    { key: "directMessages", label: "Личные чаты", desc: "Новые сообщения в личной переписке" },
    { key: "groupMessages", label: "Группы", desc: "Сообщения в групповых чатах" },
    { key: "channelMessages", label: "Каналы", desc: "Новые публикации и сообщения каналов" },
    { key: "mentions", label: "Упоминания", desc: "Когда тебя упоминают через @username" },
  ];

  const activityItems: { key: BooleanKey; label: string; desc: string }[] = [
    { key: "likes", label: "Лайки", desc: "Когда оценивают твои публикации" },
    { key: "comments", label: "Комментарии", desc: "Ответы и комментарии к публикациям" },
    { key: "newFollowers", label: "Новые подписчики", desc: "Когда кто-то подписывается" },
    { key: "storeDrops", label: "Обновления NightGram", desc: "Системные новости и новинки магазина" },
  ];

  async function persist(next: NotificationSettings) {
    setSettings(next);
    updateUser({ notificationSettings: next });
    setSaving(true);
    try {
      await api.updateProfile({ notificationSettings: next });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось сохранить настройки";
      window.dispatchEvent(new CustomEvent("nightgram:toast", { detail: { message, type: "error" } }));
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: BooleanKey) {
    void persist({ ...settings, [key]: !settings[key] });
  }

  function updateValue<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    void persist({ ...settings, [key]: value });
  }

  async function requestPermission() {
    setPushBusy(true);
    try {
      const state = await enableWebPush();
      setPushState(state);
      setPermission(state.permission);
      window.dispatchEvent(new CustomEvent("nightgram:toast", { detail: { message: "Push-уведомления включены", type: "success" } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось включить push";
      window.dispatchEvent(new CustomEvent("nightgram:toast", { detail: { message, type: "error" } }));
    } finally {
      setPushBusy(false);
    }
  }

  async function turnOffPush() {
    setPushBusy(true);
    try {
      const state = await disableWebPush();
      setPushState(state);
      setPermission(state.permission);
    } finally {
      setPushBusy(false);
    }
  }

  async function testPush() {
    setPushBusy(true);
    try {
      const result = await api.testWebPush();
      if (!result.ok) throw new Error(result.configured ? "Активная подписка не найдена" : "VAPID-ключи не настроены на backend");
      window.dispatchEvent(new CustomEvent("nightgram:toast", { detail: { message: "Тестовый push отправлен", type: "success" } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить тестовый push";
      window.dispatchEvent(new CustomEvent("nightgram:toast", { detail: { message, type: "error" } }));
    } finally {
      setPushBusy(false);
    }
  }

  const quietNow = isQuietHours(settings);

  return (
    <div className="space-y-4">
      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle icon={Bell} title="Уведомления" desc="Настрой события, тихие часы и конфиденциальность текста" />
          <div className="text-[11px] text-white/35">{saving ? "Сохраняю…" : "Синхронизировано"}</div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-neon-purple/20 bg-neon-purple/5 p-3.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">Все уведомления</div>
            <div className="text-xs text-white/45 mt-0.5">Главный переключатель всплывающих и системных уведомлений</div>
          </div>
          <Toggle on={settings.push} onClick={() => toggle("push")} />
        </div>

        {permission !== "unsupported" && (
          <div className="rounded-2xl glass p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <div className="font-medium text-sm">Push в фоне и входящие звонки</div>
              <div className="text-xs text-white/45 mt-0.5">
                {permission === "denied"
                  ? "Заблокированы в настройках браузера"
                  : pushState?.subscribed
                    ? "Это устройство подписано на сообщения и входящие звонки"
                    : pushState && !pushState.serverEnabled
                      ? "На backend ещё не настроены VAPID-ключи"
                      : "Нужно разрешение браузера и push-подписка"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!pushState?.subscribed && permission !== "denied" && <button disabled={pushBusy} onClick={requestPermission} className="btn-ghost px-3 py-2 text-xs">{pushBusy ? "Подключаю…" : "Включить"}</button>}
              {pushState?.subscribed && <button disabled={pushBusy} onClick={testPush} className="btn-ghost px-3 py-2 text-xs">Тест</button>}
              {pushState?.subscribed && <button disabled={pushBusy} onClick={turnOffPush} className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">Отключить</button>}
            </div>
          </div>
        )}
      </div>

      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-3">
        <SectionTitle icon={MessageCircle} title="Чаты" desc="Отдельные правила для разных типов переписки" />
        {chatItems.map((item) => (
          <div key={item.key} className="flex items-center gap-4 rounded-2xl glass p-3.5">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-xs text-white/45 mt-0.5">{item.desc}</div>
            </div>
            <Toggle on={Boolean(settings[item.key])} onClick={() => toggle(item.key)} />
          </div>
        ))}
      </div>

      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-3">
        <SectionTitle icon={AtSign} title="Активность" desc="Социальные и системные события" />
        {activityItems.map((item) => (
          <div key={item.key} className="flex items-center gap-4 rounded-2xl glass p-3.5">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-xs text-white/45 mt-0.5">{item.desc}</div>
            </div>
            <Toggle on={Boolean(settings[item.key])} onClick={() => toggle(item.key)} />
          </div>
        ))}
      </div>

      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-3">
        <SectionTitle icon={Clock3} title="Тихие часы" desc="Отключай отвлекающие уведомления по локальному времени устройства" />
        <div className="flex items-center gap-4 rounded-2xl glass p-3.5">
          <div className="flex-1">
            <div className="font-medium text-sm">Использовать тихие часы</div>
            <div className="text-xs text-white/45 mt-0.5">{settings.quietHoursEnabled ? (quietNow ? "Сейчас действует тихий режим" : "Сейчас уведомления разрешены") : "Расписание выключено"}</div>
          </div>
          <Toggle on={settings.quietHoursEnabled} onClick={() => toggle("quietHoursEnabled")} />
        </div>
        {settings.quietHoursEnabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="rounded-2xl glass p-3.5">
                <span className="block text-xs text-white/45 mb-2">Начало</span>
                <input type="time" value={settings.quietHoursStart} onChange={(event) => updateValue("quietHoursStart", event.target.value)} className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm" />
              </label>
              <label className="rounded-2xl glass p-3.5">
                <span className="block text-xs text-white/45 mb-2">Окончание</span>
                <input type="time" value={settings.quietHoursEnd} onChange={(event) => updateValue("quietHoursEnd", event.target.value)} className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="flex items-center gap-4 rounded-2xl glass p-3.5">
              <div className="flex-1">
                <div className="font-medium text-sm">Разрешать упоминания</div>
                <div className="text-xs text-white/45 mt-0.5">Показывать @username даже во время тихих часов</div>
              </div>
              <Toggle on={settings.quietHoursAllowMentions} onClick={() => toggle("quietHoursAllowMentions")} />
            </div>
          </>
        )}
      </div>

      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-3">
        <SectionTitle icon={Volume2} title="Звук и конфиденциальность" desc="Управляй звуком и содержимым системного уведомления" />
        <div className="flex items-center gap-4 rounded-2xl glass p-3.5">
          <div className="flex-1">
            <div className="font-medium text-sm">Звук уведомлений</div>
            <div className="text-xs text-white/45 mt-0.5">Короткий локальный сигнал без загрузки аудиофайлов</div>
          </div>
          <Toggle on={settings.sounds} onClick={() => toggle("sounds")} />
        </div>
        {settings.sounds && (
          <label className="block rounded-2xl glass p-3.5">
            <div className="flex justify-between text-sm mb-2"><span>Громкость</span><span className="text-white/45">{settings.soundVolume}%</span></div>
            <input type="range" min="0" max="100" step="5" value={settings.soundVolume} onChange={(event) => updateValue("soundVolume", Number(event.target.value))} className="w-full accent-purple-500" />
          </label>
        )}
        <div className="flex items-center gap-4 rounded-2xl glass p-3.5">
          <div className="flex-1">
            <div className="font-medium text-sm">Показывать текст сообщения</div>
            <div className="text-xs text-white/45 mt-0.5">Если выключить, системное уведомление не раскроет содержимое сообщения</div>
          </div>
          <Toggle on={settings.showMessagePreview} onClick={() => toggle("showMessagePreview")} />
        </div>
        <div className="flex items-center gap-4 rounded-2xl glass p-3.5">
          <div className="flex-1">
            <div className="font-medium text-sm">Когда NightGram открыт</div>
            <div className="text-xs text-white/45 mt-0.5">Показывать всплывающие карточки, пока окно приложения активно</div>
          </div>
          <Toggle on={settings.notifyWhenFocused} onClick={() => toggle("notifyWhenFocused")} />
        </div>
        <button onClick={() => void persist({ ...DEFAULT_NOTIFICATION_SETTINGS })} className="btn-ghost px-3.5 py-2 text-xs">Сбросить настройки</button>
      </div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative h-7 w-12 rounded-full transition shrink-0",
        on ? "bg-neon-purple" : "bg-white/15",
      )}
      style={on ? { boxShadow: "0 0 12px rgb(var(--accent-main-rgb) / 0.5)" } : undefined}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn("absolute top-1 h-5 w-5 rounded-full bg-white", on ? "left-6" : "left-1")}
      />
    </button>
  );
}


// Inline section title (no bottom border)
function SectionTitleInline({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: "color-mix(in srgb, var(--accent-main) 14%, transparent)" }}>
        <Icon size={16} className="text-neon-purple" />
      </div>
      <div>
        <h2 className="font-display font-bold text-base">{title}</h2>
        <p className="text-xs text-white/45">{desc}</p>
      </div>
    </div>
  );
}

// =============================================================================
//  Appearance section
// =============================================================================

function AppearanceSection() {
  const { settings, theme, accent, setTheme, setAccent, setGlassOpacity, setReducedMotion, setFontSize, reset } = useAppearance();
  const { user } = useAuth();
  const [ownedStoreItems, setOwnedStoreItems] = useState<StoreItem[]>([]);

  useEffect(() => {
    let active = true;
    const username = user?.username;
    if (!username) {
      setOwnedStoreItems([]);
      return;
    }
    api.getOwnedStoreItems(username)
      .then((items) => { if (active) setOwnedStoreItems(items); })
      .catch(() => { if (active) setOwnedStoreItems([]); });
    return () => { active = false; };
  }, [user?.username]);

  const fontSizes: { id: AppearanceSettings["fontSize"]; label: string }[] = [
    { id: "sm", label: "S" },
    { id: "base", label: "M" },
    { id: "lg", label: "L" },
  ];

  return (
    <div className="space-y-6">
      {/* ===== THEME (background + cards + text + surfaces) ===== */}
      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitleInline icon={Palette} title="Тема" desc="Фон, карточки, текст и поверхности" />
          <span className="text-xs text-white/40 flex items-center gap-1">{theme.emoji} {theme.label}</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {THEMES.filter((t) => !MARKET_THEME_IDS.has(t.id) || hasOwnedStoreEffect(ownedStoreItems, "theme", t.id)).map((t) => {
            const active = settings.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "group relative aspect-square rounded-2xl overflow-visible transition border-2",
                  active ? "border-white scale-[1.04] shadow-glow" : "border-white/10 hover:border-white/30",
                )}
                style={{ background: t.swatch, backgroundColor: t.bgColor }}
                title={t.label}
              >
                {/* mini inner card preview */}
                <span className="absolute top-1.5 left-1.5 right-1.5 h-1 rounded-full" style={{ background: t.text, opacity: 0.5 }} />
                <span className="absolute top-3.5 left-1.5 w-1.5 h-1.5 rounded-full" style={{ background: accent.main }} />
                <span className="absolute top-3.5 left-4 right-1.5 h-1 rounded-full" style={{ background: t.text, opacity: 0.25 }} />
                <span className="absolute bottom-3 left-1.5 right-1.5 h-4 rounded-lg"
                  style={{ background: `rgba(${t.glassR},${t.glassG},${t.glassB},0.9)`, border: `1px solid ${accent.main}40` }} />
                {/* selected check */}
                {active && (
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid place-items-center h-7 w-7 rounded-full" style={{ background: accent.main, boxShadow: `0 0 16px ${accent.main}` }}>
                      <Check size={15} className="text-white" />
                    </span>
                  </span>
                )}
                {/* label */}
                <span className="absolute bottom-0 inset-x-0 text-center text-[9px] py-0.5 font-medium backdrop-blur-sm"
                  style={{ background: "rgba(0,0,0,0.35)", color: t.isLight ? "#1a1530" : "#fff" }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== ACCENT (buttons, glow, hover, borders, gradients) ===== */}
      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <SectionTitleInline icon={Sparkles} title="Акцент" desc="Кнопки, подсветка, hover, бордеры, градиенты и свечение" />
          <span className="text-xs text-white/40 flex items-center gap-1">{accent.emoji} {accent.label}</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {ACCENTS.filter((a) => !MARKET_ACCENT_IDS.has(a.id) || hasOwnedStoreEffect(ownedStoreItems, "accent", a.id)).map((a) => {
            const active = settings.accent === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAccent(a.id)}
                className={cn(
                  "group relative aspect-square rounded-2xl overflow-hidden transition border-2 flex flex-col items-center justify-center gap-1.5",
                  active ? "border-white scale-[1.04]" : "border-white/10 hover:border-white/30",
                )}
                style={{ background: `linear-gradient(135deg, ${a.main}, ${a.secondary})` }}
                title={a.label}
              >
                {/* glow dot */}
                <span className="h-7 w-7 rounded-full grid place-items-center transition group-hover:scale-110"
                  style={{ background: a.main, boxShadow: active ? `0 0 20px ${a.main}, 0 0 8px #fff` : `0 0 12px ${a.tertiary}` }}>
                  {active && <Check size={14} className="text-white" />}
                </span>
                {/* mini button preview */}
                <span className="h-2 w-8 rounded-full" style={{ background: a.tertiary, opacity: 0.9 }} />
                <span className="absolute bottom-0 inset-x-0 text-center text-[9px] py-0.5 font-medium"
                  style={{ background: "rgba(0,0,0,0.35)", color: "#fff" }}>
                  {a.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Live preview ===== */}
      <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-4">
        <SectionTitleInline icon={Palette} title="Превью" desc="Так выглядит сайт с выбранными настройками" />
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-2xl glass p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl grid place-items-center" style={{ background: accent.main, boxShadow: `0 0 16px ${accent.main}` }}>
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: accent.main }}>@username</div>
                <div className="text-xs text-white/45">Glow + акцент</div>
              </div>
            </div>
            <button className="btn-glow px-3.5 py-2 text-xs">Кнопка</button>
          </div>
          <div className="rounded-2xl glass p-4 flex items-center justify-between">
            <span className="text-xs text-white/55">Hover-эффект</span>
            <button className="btn-ghost px-3.5 py-2 text-xs">Наведи</button>
          </div>
        </div>

        {/* Glass opacity */}
        <div>
          <label className="text-sm text-white/65 mb-2 ml-1 flex items-center justify-between">
            <span>Прозрачность стекла</span>
            <span className="text-xs" style={{ color: accent.main }}>{Math.round(settings.glassOpacity * 100)}%</span>
          </label>
          <input
            type="range"
            min={0.2}
            max={0.85}
            step={0.05}
            value={settings.glassOpacity}
            onChange={(e) => setGlassOpacity(parseFloat(e.target.value))}
            className="w-full"
            style={{ accentColor: accent.main }}
          />
        </div>

        {/* Font size */}
        <div>
          <label className="text-sm text-white/65 mb-2 ml-1 block">Размер шрифта</label>
          <div className="flex gap-2">
            {fontSizes.map((f) => (
              <button
                key={f.id}
                onClick={() => setFontSize(f.id)}
                className={cn(
                  "flex-1 rounded-xl py-2.5 text-sm font-semibold transition",
                  settings.fontSize === f.id ? "btn-glow" : "glass text-white/60",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reduced motion */}
        <div className="flex items-center gap-4 rounded-2xl glass p-3.5">
          <div className="flex-1">
            <div className="font-medium text-sm">Уменьшить анимации</div>
            <div className="text-xs text-white/45 mt-0.5">Отключить плавные переходы</div>
          </div>
          <Toggle on={settings.reducedMotion} onClick={() => setReducedMotion(!settings.reducedMotion)} />
        </div>

        <button onClick={reset} className="btn-ghost px-5 py-2.5 text-sm">
          Сбросить настройки
        </button>
      </div>
    </div>
  );
}



// =============================================================================
//  Audio section
// =============================================================================

function AudioSection() {
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutput, setSelectedOutput] = useState("");

  useEffect(() => {
    setSelectedOutput(localStorage.getItem("ng_audio_output_device") || "");
    async function refreshAudioOutputs() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setAudioOutputs(devices.filter((device) => device.kind === "audiooutput"));
    }
    refreshAudioOutputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshAudioOutputs);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshAudioOutputs);
  }, []);

  function saveAudioOutput(deviceId: string) {
    setSelectedOutput(deviceId);
    if (deviceId) localStorage.setItem("ng_audio_output_device", deviceId);
    else localStorage.removeItem("ng_audio_output_device");
    window.dispatchEvent(new CustomEvent("nightgram:audio-output-change", { detail: { deviceId } }));
  }

  async function refreshWithPermission() {
    await navigator.mediaDevices?.getUserMedia({ audio: true })
      .then((s) => { s.getTracks().forEach((t) => t.stop()); return navigator.mediaDevices.enumerateDevices(); })
      .then((devices) => setAudioOutputs(devices.filter((d) => d.kind === "audiooutput")))
      .catch(() => {});
  }

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-4">
      <SectionTitle icon={Volume2} title="Звук" desc="Устройство вывода для звонков и будущего плеера" />
      <div className="rounded-3xl glass p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-xs text-white/55">
            Устройство вывода
            <CustomSelect
              value={selectedOutput}
              onChange={saveAudioOutput}
              placeholder="По умолчанию"
              className="mt-1"
              options={[
                { value: "", label: "По умолчанию", description: "Системный вывод браузера" },
                ...audioOutputs.map((device) => ({
                  value: device.deviceId,
                  label: device.label || `Устройство ${device.deviceId.slice(0, 6)}`,
                  description: device.deviceId ? `ID ${device.deviceId.slice(0, 10)}…` : undefined,
                })),
              ]}
            />
          </label>
          <button type="button" onClick={refreshWithPermission} className="btn-ghost px-4 py-2.5 text-sm">Обновить</button>
        </div>
        <p className="mt-2 text-[11px] text-white/35">Если браузер не показывает названия устройств — нажми «Обновить» и разреши доступ к микрофону один раз.</p>
      </div>
    </div>
  );
}

// =============================================================================
//  Integrations section
// =============================================================================

function IntegrationsSection() {
  const [tutorial, setTutorial] = useState<"discord" | "spotify" | "soundcloud" | "vk" | null>(null);
  const platforms = [
    { id: "discord" as const, name: "Discord", emoji: "🎮", color: "#5865F2" },
    { id: "spotify" as const, name: "Spotify", emoji: "🎵", color: "#1DB954" },
    { id: "soundcloud" as const, name: "SoundCloud", emoji: "☁️", color: "#FF5500" },
    { id: "vk" as const, name: "VK Музыка", emoji: "💙", color: "#0077FF" },
  ];

  const tutorialText: Record<string, string[]> = {
    discord: [
      "Discord-интеграция вернётся позже через официальный OAuth.",
      "Пока можно вступить на сервер вручную и указать свой NightGram username.",
      "Позже добавим автоматическую выдачу ролей и связку аккаунтов.",
    ],
    spotify: [
      "Открой любимый альбом/плейлист в Spotify.",
      "Скопируй названия треков и артистов в текстовый файл.",
      "Формат одной строки: Artist - Title | direct-audio-url (если есть).",
      "Если прямого audio URL нет — NightGram найдёт 30-секундное preview через iTunes, а полный трек можно слушать только через официальный источник.",
    ],
    soundcloud: [
      "Открой трек/плейлист в SoundCloud.",
      "Если трек разрешён автором для скачивания — используй официальный download/direct link.",
      "Вставь строки в формате: Artist - Title | audio-url | cover-url.",
      "Чужие закрытые треки без разрешения мы не вытаскиваем — это нарушение прав.",
    ],
    vk: [
      "Открой список любимых треков в VK Музыке.",
      "Собери названия в .txt: Artist - Title по одному треку на строку.",
      "Загрузи/вставь список в будущий импорт любимых треков NightGram.",
      "Полные аудио нужны из легального источника или твоего файла.",
    ],
  };

  return (
    <div className="space-y-3">
      <SectionTitleInline icon={Plug} title="Музыкальные источники" desc="Интеграции Spotify/SoundCloud/VK появятся позже — пока доступен импорт списком" />
      {platforms.map((p) => (
        <div key={p.id} className="flex items-center gap-4 rounded-2xl glass-strong p-4 transition hover:brightness-110">
          <div className="h-12 w-12 rounded-xl grid place-items-center text-2xl shrink-0" style={{ background: `${p.color}22` }}>{p.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-2">
              {p.name}
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>СКОРО</span>
            </div>
            <div className="text-xs text-white/50 mt-0.5">Пока можно подготовить список любимых треков для импорта</div>
          </div>
          <button onClick={() => setTutorial(p.id)} className="btn-ghost px-4 py-2.5 text-sm shrink-0">Как получить треки?</button>
        </div>
      ))}

      <div className="rounded-2xl glass p-4 text-xs text-white/45">
        Формат для импорта: <b className="text-white/70">Artist - Title | audio-url | cover-url</b>. URL необязательны: если их нет, NightGram попробует найти preview.
      </div>

      <AnimatePresence>
        {tutorial && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setTutorial(null)} />
            <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-6 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <h3 className="font-display font-bold text-xl mb-3">Как подготовить треки</h3>
              <ol className="space-y-2 text-sm text-white/65 list-decimal list-inside">
                {tutorialText[tutorial].map((step) => <li key={step}>{step}</li>)}
              </ol>
              <button onClick={() => setTutorial(null)} className="btn-glow w-full py-3 mt-5 text-sm">Понял</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
//  Moderation section (demo)
// =============================================================================

function ModerationSection() {
  return (
    <div className="space-y-4">
      <SectionTitleInline icon={Gavel} title="Moderation" desc="Admin panel" />

      <Link href="/admin" className="btn-glow w-full py-4 rounded-2xl text-sm flex items-center justify-center gap-2 overflow-visible">
        <Shield size={18} /> Открыть админ-панель
      </Link>

      <p className="text-xs text-white/40 text-center">
        Полная панель модерации доступна на странице /admin
      </p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl glass p-3 text-center">
      <div className="font-display font-bold text-xl" style={{ color }}>{value}</div>
      <div className="text-[10px] text-white/45 mt-0.5">{label}</div>
    </div>
  );
}

// =============================================================================
//  Shared helpers
// =============================================================================

function SectionTitle({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-white/5">
      <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: "rgb(var(--accent-main-rgb) / 0.12)" }}>
        <Icon size={18} className="text-neon-purple" />
      </div>
      <div>
        <h2 className="font-display font-bold text-lg">{title}</h2>
        <p className="text-xs text-white/45">{desc}</p>
      </div>
    </div>
  );
}

function FieldBlock({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-sm text-white/65 mb-2 ml-1">
        {icon} {label}
      </span>
      {children}
    </div>
  );
}

// =============================================================================
//  NameColorPicker — Premium-gated username color selector
// =============================================================================

function NameColorPicker({
  nameColor,
  setNameColor,
  activeId,
  isPremium,
  ownedStoreItems,
}: {
  nameColor: string;
  setNameColor: (color: string, id: string) => void;
  activeId: string;
  isPremium: boolean;
  ownedStoreItems: StoreItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const activePreset = NAME_COLORS.find((preset) => activeId === preset.id || nameColor.toLowerCase() === preset.color.toLowerCase()) ?? NAME_COLORS[0];

  return (
    <div className="relative">
      <span className="flex items-center gap-1.5 text-sm text-white/65 mb-2 ml-1">
        <Sparkles size={13} className="text-neon-purple" /> Цвет имени
        {!isPremium && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold flex items-center gap-1"
            style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}
          >
            <Crown size={10} /> Premium
          </span>
        )}
      </span>

      {isPremium ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${activePreset.color}42, rgba(7,3,18,0.98) 62%)`, borderColor: `${activePreset.color}88`, boxShadow: `0 0 18px ${activePreset.color}22` }}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/15" style={{ background: activePreset.color, boxShadow: `0 0 14px ${activePreset.color}66` }}>
              {activePreset.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold" style={{ color: activePreset.color }}>@username</span>
              <span className="block text-xs text-white/40">{activePreset.label} · выбрать из готовых цветов</span>
            </span>
            <span className="text-xs text-white/35">{open ? "Свернуть" : "Выбрать"}</span>
          </button>
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                className="ng-select-scroll mt-2 mb-4 max-h-72 overflow-y-auto rounded-3xl border border-neon-purple/30 bg-[#090512] p-2 pr-3 shadow-[0_0_34px_rgba(168,85,247,0.28)]"
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {NAME_COLORS.filter((preset) => !isMarketNameColorId(preset.id) || hasOwnedStoreEffect(ownedStoreItems, "name_color", preset.color)).map((preset) => {
                    const active = activeId === preset.id || nameColor.toLowerCase() === preset.color.toLowerCase();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => { setNameColor(preset.color, preset.id); setOpen(false); }}
                        className={cn("flex items-center gap-2 rounded-2xl border px-2.5 py-2 text-left text-xs transition", active ? "text-white shadow-glow" : "border-white/10 bg-white/[0.035] text-white/62 hover:text-white hover:border-white/25")}
                        style={active ? { background: `linear-gradient(135deg, ${preset.color}44, rgba(255,255,255,0.06))`, borderColor: `${preset.color}88` } : undefined}
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ background: preset.color, boxShadow: active ? `0 0 12px ${preset.color}` : undefined }}>
                          {active ? <Check size={13} className="text-white drop-shadow" /> : preset.emoji}
                        </span>
                        <span className="min-w-0 truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <div className="rounded-2xl glass p-4 space-y-3">
          <div className="grid grid-cols-5 gap-2">
            {NAME_COLORS.slice(0, 10).map((preset) => (
              <div
                key={preset.id}
                className="relative aspect-square rounded-xl overflow-hidden"
                style={{ background: preset.color }}
              >
                <span className="absolute inset-0 bg-black/45" />
                <span className="absolute inset-0 grid place-items-center">
                  <Lock className="text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]" size={15} />
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-white/70">
                {NAME_COLORS.length} цветов ника доступны с <b style={{ color: "#fbbf24" }}>NightGram Premium</b>
              </p>
              <p className="text-xs text-white/40 mt-0.5">На всех закрытых цветах теперь виден замок.</p>
            </div>
            <button
              onClick={() => router.push("/store")}
              className="btn-glow px-4 py-2.5 text-sm flex items-center gap-2 shrink-0"
              style={{ background: "linear-gradient(135deg,#fbbf24,#f59e0b)" }}
            >
              <Crown size={15} /> Premium
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
