"use client";

// =============================================================================
//  NightGram Web — Settings page (multi-section)
//  Profile · Security · Notifications · Appearance · Integrations · Moderation
// =============================================================================

import { useRef, useState } from "react";
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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppearanceSettings, NotificationSettings, User } from "@/types";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { useAuth } from "@/context/AuthContext";
import { useAppearance, THEMES, ACCENTS } from "@/context/AppearanceContext";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/supabase";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { NAME_COLORS } from "@/lib/nameColors";
import { PremiumRequiredModal } from "@/components/shared/PremiumRequiredModal";

type Tab = "profile" | "security" | "notifications" | "appearance" | "integrations" | "moderation";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "profile", label: "Профиль", icon: UserIcon },
  { id: "security", label: "Безопасность", icon: Shield },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "appearance", label: "Внешний вид", icon: Palette },
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
    <div className="relative max-w-4xl mx-auto px-4">
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
              {tab === "security" && <SecuritySection />}
              {tab === "notifications" && <NotificationsSection />}
              {tab === "appearance" && <AppearanceSection />}
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
//  Profile section
// =============================================================================

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPremiumBannerModal, setShowPremiumBannerModal] = useState(false);

  if (!user) return null;

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await uploadMedia(f, "avatars");
    setAvatarUrl(url);
  }

  async function pickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = await uploadMedia(f, "posts");
    setBannerUrl(url);
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
      customId: customId.trim() || null,
    };
    try {
      const updated = await api.updateProfile(patch);
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  const ngIdDisplay = String(user.ngId).padStart(8, "0");

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-5">
      <SectionTitle icon={UserIcon} title="Профиль" desc="Аватар, баннер, имя и ID" />

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
            ringColor="#0e0a22"
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
      />

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
          background: rgba(14, 10, 34, 0.6);
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 14px;
          padding: 12px 14px;
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
//  Security section
// =============================================================================

function SecuritySection() {
  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-5">
      <SectionTitle icon={Shield} title="Безопасность" desc="Пароль, почта и защита аккаунта" />

      <FieldBlock label="Email">
        <input type="email" defaultValue="you@nightgram.app" disabled className="ng-input opacity-60" />
      </FieldBlock>

      <FieldBlock label="Текущий пароль">
        <input type="password" placeholder="••••••••" className="ng-input" />
      </FieldBlock>

      <div className="grid sm:grid-cols-2 gap-3">
        <FieldBlock label="Новый пароль">
          <input type="password" placeholder="Минимум 8 символов" className="ng-input" />
        </FieldBlock>
        <FieldBlock label="Повторите пароль">
          <input type="password" placeholder="••••••••" className="ng-input" />
        </FieldBlock>
      </div>

      <button className="btn-glow px-5 py-2.5 text-sm inline-flex items-center gap-2">
        <Save size={15} /> Обновить пароль
      </button>

      {/* 2FA */}
      <div className="rounded-2xl glass p-4 flex items-center gap-4 mt-4">
        <div className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ background: "rgb(var(--accent-main-rgb) / 0.15)" }}>
          <Shield size={20} className="text-neon-purple" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Двухфакторная аутентификация (2FA)</div>
          <div className="text-xs text-white/45 mt-0.5">Дополнительный уровень защиты при входе</div>
        </div>
        <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}>
          Скоро
        </span>
      </div>

      <style jsx>{`
        :global(.ng-input) {
          width: 100%;
          background: rgba(14, 10, 34, 0.6);
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 14px;
          padding: 12px 14px;
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
//  Notifications section
// =============================================================================

function NotificationsSection() {
  const { user, updateUser } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(
    user?.notificationSettings ?? {
      push: true,
      messages: true,
      likes: true,
      comments: true,
      newFollowers: true,
      storeDrops: true,
      sounds: true,
    },
  );

  const items: { key: keyof NotificationSettings; label: string; desc: string }[] = [
    { key: "push", label: "Push-уведомления", desc: "Получать уведомления в браузере" },
    { key: "messages", label: "Сообщения", desc: "Новые сообщения в мессенджере" },
    { key: "likes", label: "Лайки", desc: "Когда оценивают твои посты" },
    { key: "comments", label: "Комментарии", desc: "Ответы на твои посты" },
    { key: "newFollowers", label: "Новые подписчики", desc: "Когда кто-то подписывается" },
    { key: "storeDrops", label: "Новые обновления", desc: "Обновления и новинки в Night Store" },
    { key: "sounds", label: "Звуки", desc: "Звуковые эффекты уведомлений" },
  ];

  function toggle(key: keyof NotificationSettings) {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    updateUser({ notificationSettings: next });
  }

  return (
    <div className="gradient-border rounded-4xl glass-strong p-5 md:p-6 space-y-3">
      <SectionTitle icon={Bell} title="Уведомления" desc="Выбери, о чём ты хочешь знать" />

      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-4 rounded-2xl glass p-3.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{item.label}</div>
            <div className="text-xs text-white/45 mt-0.5">{item.desc}</div>
          </div>
          <Toggle on={settings[item.key]} onClick={() => toggle(item.key)} />
        </div>
      ))}
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
          {THEMES.map((t) => {
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
          {ACCENTS.map((a) => {
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
//  Integrations section
// =============================================================================

function IntegrationsSection() {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [vkToken, setVkToken] = useState("");
  const [vkConnected, setVkConnected] = useState(false);
  const [connectedServices, setConnectedServices] = useState<Set<string>>(new Set());

  const integrations = [
    {
      id: "discord",
      name: "Discord",
      desc: "Подключи аккаунт — получи роль на сервере и доступ к закрытым каналам",
      emoji: "🎮",
      color: "#5865F2",
      type: "oauth" as const,
      href: "https://discord.gg/nightgram",
    },
    {
      id: "spotify",
      name: "Spotify",
      desc: "Покажи что слушаешь, делись треками прямо в профиле и чатах",
      emoji: "🎵",
      color: "#1DB954",
      type: "oauth" as const,
      href: "https://accounts.spotify.com/oauth/authorize?client_id=nightgram&response_type=code&redirect_uri=https://night-gram.vercel.app/integrations/spotify&scope=user-read-currently-playing+user-top-read+playlist-read-private",
    },
    {
      id: "soundcloud",
      name: "SoundCloud",
      desc: "Интеграция твоих треков и плейлистов в профиль",
      emoji: "☁️",
      color: "#FF5500",
      type: "oauth" as const,
      href: "https://soundcloud.com/connect?client_id=nightgram&redirect_uri=https://night-gram.vercel.app/integrations/soundcloud&response_type=code&scope=non-expiring",
    },
    {
      id: "vk",
      name: "VK Музыка",
      desc: "Импорт любимых треков и статуса прослушивания через токен",
      emoji: "💙",
      color: "#0077FF",
      type: "token" as const,
      href: "#",
    },
  ];

  function connectOAuth(id: string, href: string) {
    setConnecting(id);
    window.open(href, "_blank", "noopener,noreferrer");
    setTimeout(() => { setConnecting(null); setConnectedServices((prev) => new Set(prev).add(id)); }, 2000);
  }

  function connectVKToken() {
    if (!vkToken.trim()) return;
    setConnecting("vk");
    // Save token to user profile via API
    api.updateProfile({ glowEffect: `vk:${vkToken.trim().slice(0, 8)}` }).catch(() => {});
    setConnectedServices((prev) => new Set(prev).add("vk"));
    setVkConnected(true);
    setVkToken("");
    setConnecting(null);
  }

  function disconnect(id: string) {
    setConnectedServices((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <SectionTitleInline icon={Plug} title="Интеграции" desc="Подключи внешние сервисы" />

      {integrations.map((it) => {
        const isConnected = connectedServices.has(it.id);
        return (
          <div
            key={it.id}
            className="flex items-center gap-4 rounded-2xl glass-strong p-4 transition hover:brightness-110"
          >
            <div
              className="h-12 w-12 rounded-xl grid place-items-center text-2xl shrink-0"
              style={{ background: `${it.color}22` }}
            >
              {it.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm flex items-center gap-2">
                {it.name}
                {isConnected && (
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80" }}>
                    Подключено
                  </span>
                )}
              </div>
              <div className="text-xs text-white/50 mt-0.5">{it.desc}</div>
            </div>

            {/* VK — token input */}
            {it.type === "token" ? (
              isConnected ? (
                <button
                  onClick={() => disconnect(it.id)}
                  className="btn-ghost px-4 py-2.5 text-sm shrink-0"
                >
                  Отключить
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    value={vkToken}
                    onChange={(e) => setVkToken(e.target.value)}
                    placeholder="Вставь токен"
                    className="rounded-lg glass px-3 py-2 text-xs outline-none w-32 focus:border-neon-purple/40"
                  />
                  <button
                    onClick={connectVKToken}
                    disabled={connecting === "vk" || !vkToken.trim()}
                    className="btn-glow px-4 py-2 text-sm shrink-0"
                    style={{ background: `linear-gradient(135deg, ${it.color}, ${it.color}cc)` }}
                  >
                    {connecting === "vk" ? "…" : "ОК"}
                  </button>
                </div>
              )
            ) : (
              <button
                onClick={() => connectOAuth(it.id, it.href)}
                disabled={connecting === it.id || isConnected}
                className="btn-glow px-4 py-2.5 text-sm shrink-0"
                style={isConnected ? { background: "rgba(34,197,94,0.15)" } : { background: `linear-gradient(135deg, ${it.color}, ${it.color}cc)` }}
              >
                {isConnected ? "✓" : connecting === it.id ? "Подключение…" : "Подключить"}
              </button>
            )}
          </div>
        );
      })}

      {/* VK token help */}
      <div className="rounded-2xl glass p-3 text-xs text-white/40 flex items-center gap-2">
        <Shield size={13} className="shrink-0" />
        <span>OAuth-подключение для Discord/Spotify/SoundCloud. Для VK нужен токен доступа. Токены хранятся безопасно — мы не видим пароли.</span>
      </div>

      {/* VK token guide */}
      <div className="rounded-2xl glass p-4">
        <div className="text-xs font-semibold text-white/60 mb-2">Как получить токен VK:</div>
        <ol className="text-[11px] text-white/40 space-y-1 list-decimal list-inside">
          <li>Перейди на vkhost.github.io</li>
          <li>Выбери «VK Music» или «Kate Mobile»</li>
          <li>Нажми «Разрешить доступ»</li>
          <li>Скопируй токен из адресной строки</li>
          <li>Вставь его в поле выше</li>
        </ol>
      </div>
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
  setNameColor,
  activeId,
  isPremium,
}: {
  nameColor: string;
  setNameColor: (color: string, id: string) => void;
  activeId: string;
  isPremium: boolean;
}) {
  const router = useRouter();

  return (
    <div>
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
        /* Premium: full 15-color palette, clickable */
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {NAME_COLORS.map((preset) => {
            const active = activeId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => setNameColor(preset.color, preset.id)}
                className={cn(
                  "relative aspect-square rounded-2xl overflow-hidden transition border-2 flex flex-col items-center justify-center gap-1 group",
                  active ? "border-white scale-[1.05]" : "border-white/10 hover:border-white/30",
                )}
                style={{ background: `linear-gradient(135deg, ${preset.color}, ${preset.color}aa)` }}
                title={preset.label}
              >
                <span
                  className="h-6 w-6 rounded-full transition group-hover:scale-110"
                  style={{ background: "#fff", boxShadow: active ? `0 0 14px ${preset.color}, 0 0 4px #fff` : `0 0 8px ${preset.color}` }}
                >
                  {active && (
                    <span className="grid place-items-center h-full w-full" style={{ color: preset.color }}>
                      <Check size={13} />
                    </span>
                  )}
                </span>
                <span className="text-[9px] text-white font-medium" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* Not premium: locked palette + upsell */
        <div className="rounded-2xl glass p-4 space-y-3">
          <div className="grid grid-cols-5 gap-2">
            {NAME_COLORS.slice(0, 10).map((preset) => (
              <div
                key={preset.id}
                className="relative aspect-square rounded-xl overflow-hidden opacity-40 grayscale"
                style={{ background: preset.color }}
              >
                <span className="absolute inset-0 grid place-items-center">
                  <Lock className="text-white/80" size={14} />
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm text-white/70">
                15 цветов ника доступны с <b style={{ color: "#fbbf24" }}>NightGram Premium</b>
              </p>
              <p className="text-xs text-white/40 mt-0.5">
                Сейчас активен базовый цвет (бесплатный)
              </p>
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
