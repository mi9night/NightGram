"use client";

// =============================================================================
//  AppNav — top navigation bar shown on all authenticated pages.
//  Structure: main bar (logo + nav + actions) + balance row below (right-aligned)
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  MessageCircle,
  ShoppingBag,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  Sparkles,
  Settings,
  Music,
  Radio,
} from "lucide-react";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { SupportButton } from "@/components/shared/SupportButton";
import { BalanceDropdown } from "@/components/shared/BalanceDropdown";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/feed", label: "Лента", icon: Home },
  { href: "/messages", label: "Сообщения", icon: MessageCircle },
  { href: "/music", label: "Музыка", icon: Music, soon: true },
  { href: "/channels", label: "Каналы", icon: Radio },
  { href: "/store", label: "Магазин", icon: ShoppingBag },
  { href: "/profile/you", label: "Профиль", icon: UserIcon },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [messageUnread, setMessageUnread] = useState({ total: 0, muted: 0 });

  useEffect(() => {
    const read = () => {
      const total = Number(localStorage.getItem("ng_message_unread_total") || 0);
      const muted = Number(localStorage.getItem("ng_message_unread_muted") || 0);
      setMessageUnread({ total, muted });
    };
    read();
    function onUnread(e: Event) {
      const detail = (e as CustomEvent<{ muted?: boolean }>).detail;
      const total = Number(localStorage.getItem("ng_message_unread_total") || 0) + 1;
      const muted = Number(localStorage.getItem("ng_message_unread_muted") || 0) + (detail?.muted ? 1 : 0);
      localStorage.setItem("ng_message_unread_total", String(total));
      localStorage.setItem("ng_message_unread_muted", String(muted));
      setMessageUnread({ total, muted });
    }
    window.addEventListener("nightgram:message-unread", onUnread);
    return () => window.removeEventListener("nightgram:message-unread", onUnread);
  }, []);

  useEffect(() => {
    if (!user || pathname.startsWith("/messages")) return;
    let active = true;
    api.getConversations()
      .then((conversations) => {
        if (!active) return;
        const total = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        const muted = conversations.filter((c) => c.muted).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        localStorage.setItem("ng_message_unread_total", String(total));
        localStorage.setItem("ng_message_unread_muted", String(muted));
        setMessageUnread({ total, muted });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [pathname, user]);

  if (!user) return null;

  const profileHref = `/profile/${user.username}`;

  async function handleLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <>
      {/* Desktop top bar */}
      <motion.header initial={false} className="fixed top-0 inset-x-0 z-50">
        <div className="max-w-7xl mx-auto px-4 pt-3">
          {/* Main bar */}
          <div className="glass-strong rounded-2xl px-3 sm:px-4 py-2.5 flex items-center justify-between relative min-w-0">
            <Link href="/feed" className="shrink-0">
              <NightGramWordmark size={30} />
            </Link>

            {/* Center nav (desktop) — absolutely centered in the bar */}
            <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
              {LINKS.map((l) => {
                const active =
                  l.href === "/feed"
                    ? pathname === "/feed"
                    : pathname.startsWith(l.href.split("/")[1] ? `/${l.href.split("/")[1]}` : l.href);
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href === "/profile/you" ? profileHref : l.href}
                    className={cn(
                      "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition",
                      active ? "text-white" : "text-white/55 hover:text-white",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nightgram-nav-active"
                        className="absolute inset-0 rounded-xl"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        style={{
                          background: "color-mix(in srgb, var(--accent-main) 15%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--accent-main) 35%, transparent)",
                          boxShadow: "0 0 16px color-mix(in srgb, var(--accent-main) 25%, transparent)",
                        }}
                      />
                    )}
                    <Icon size={17} className="relative z-10" />
                    <span className="relative z-10 hidden lg:inline">{l.label}</span>
                    {"soon" in l && l.soon && (
                      <span className="relative z-10 hidden xl:inline rounded-full bg-neon-purple/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-neon-purple">
                        скоро
                      </span>
                    )}
                    {l.href === "/messages" && messageUnread.total > 0 && (
                      <span className={cn("relative z-10 grid min-w-[18px] h-[18px] place-items-center rounded-full px-1 text-[10px] font-bold", messageUnread.muted === messageUnread.total ? "bg-black/40 text-white/65" : "bg-white/85 text-midnight-950")}>
                        {messageUnread.total > 99 ? "99+" : messageUnread.total}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right — support + notifications + settings + avatar */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <SupportButton />
              <NotificationBell />
              <Link
                href="/settings"
                className={cn(
                  "hidden md:grid place-items-center h-9 w-9 rounded-xl transition",
                  pathname === "/settings"
                    ? "bg-neon-purple/15 text-white border border-neon-purple/40"
                    : "glass text-white/60 hover:text-neon-purple",
                )}
                title="Настройки"
              >
                <Settings size={16} />
              </Link>
              <Link href={profileHref} className="shrink-0">
                <GlowAvatar
                  src={user.avatarUrl}
                  alt={user.username}
                  size={38}
                  glow={user.glowEffect ?? undefined}
                  frame={user.avatarFrame ?? undefined}
                />
              </Link>
              <button
                onClick={handleLogout}
                className="hidden md:grid place-items-center h-9 w-9 rounded-xl glass text-white/60 hover:text-red-400 transition"
                title="Выйти"
              >
                <LogOut size={16} />
              </button>
              <button
                onClick={() => setMobileOpen(true)}
                className="md:hidden grid place-items-center h-9 w-9 rounded-xl glass"
              >
                <Menu size={18} />
              </button>
            </div>
          </div>

          {/* Balance row — below the main bar, aligned to the right edge */}
          <div className="hidden md:flex justify-end mt-2 pr-1">
            <BalanceDropdown />
          </div>
        </div>
      </motion.header>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 glass-strong border-t border-white/5 overflow-x-auto scrollbar-hide">
        <div className="flex min-w-max justify-around py-2 px-1">
          {LINKS.map((l) => {
            const Icon = l.icon;
            const active =
              l.href === "/feed"
                ? pathname === "/feed"
                : pathname.startsWith(l.href.split("/")[1] ? `/${l.href.split("/")[1]}` : l.href);
            return (
              <Link
                key={l.href}
                href={l.href === "/profile/you" ? profileHref : l.href}
                className={cn(
                  "flex w-[68px] flex-col items-center gap-0.5 px-1 py-1 text-[9px] transition",
                  active ? "text-neon-purple" : "text-white/50",
                )}
              >
                <Icon size={20} />
                <span className="flex items-center gap-1">
                  {l.label}
                  {"soon" in l && l.soon && <span className="text-[8px] text-neon-purple">•</span>}
                  {l.href === "/messages" && messageUnread.total > 0 && (
                    <span className={cn("grid min-w-[15px] h-[15px] place-items-center rounded-full px-1 text-[8px] font-bold", messageUnread.muted === messageUnread.total ? "bg-black/40 text-white/65" : "bg-white/85 text-midnight-950")}>
                      {messageUnread.total > 9 ? "9+" : messageUnread.total}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile menu sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] md:hidden"
          >
            <div className="absolute inset-0 bg-midnight-950/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="absolute right-0 top-0 bottom-0 w-72 glass-strong p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <NightGramWordmark size={28} />
                <button onClick={() => setMobileOpen(false)} className="grid place-items-center h-9 w-9 rounded-xl glass">
                  <X size={18} />
                </button>
              </div>
              {LINKS.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={l.href === "/profile/you" ? profileHref : l.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-white/80 hover:bg-neon-purple/10 transition mb-1"
                  >
                    <Icon size={18} /> {l.label}
                    {"soon" in l && l.soon && <span className="ml-auto rounded-full bg-neon-purple/15 px-2 py-0.5 text-[9px] font-bold uppercase text-neon-purple">скоро</span>}
                  </Link>
                );
              })}
              <Link
                href="/store/premium"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-white/80 hover:bg-neon-purple/10 transition mb-1"
              >
                <Sparkles size={18} /> Premium и NightCoins
              </Link>
              <Link
                href="/notifications"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-white/80 hover:bg-neon-purple/10 transition mb-1"
              >
                <Settings size={18} /> Уведомления
              </Link>
              <Link
                href="/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-white/80 hover:bg-neon-purple/10 transition mb-1"
              >
                <Settings size={18} /> Настройки
              </Link>
              <div className="mt-auto pt-4 border-t border-white/5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 rounded-xl px-3 py-3 text-red-400 hover:bg-red-500/10 transition"
                >
                  <LogOut size={18} /> Выйти
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
