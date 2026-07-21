"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, MessageCircle, Phone, Radio, Search, Settings, ShoppingBag, User, LogOut, Bell } from "lucide-react";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

const links = [
  { href: "/feed", label: "Главная", icon: Home },
  { href: "/messages", label: "Чаты", icon: MessageCircle },
  { href: "/calls", label: "Звонки", icon: Phone },
  { href: "/channels", label: "Каналы", icon: Radio },
  { href: "/search", label: "Поиск", icon: Search },
  { href: "/store", label: "Магазин", icon: ShoppingBag },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const warmRoutes = () => {
      if (cancelled) return;
      ["/feed", "/messages", "/calls", "/channels", "/search", "/notifications", "/settings"].forEach((href) => router.prefetch(href));
      router.prefetch(`/profile/${user.username}`);
    };

    const win = window as Window & typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(warmRoutes, { timeout: 2400 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(id);
      };
    }

    const id = window.setTimeout(warmRoutes, 1400);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [router, user]);

  if (!user) return null;

  const profileHref = `/profile/${user.username}`;
  const isActive = (href: string) => href === "/feed" ? pathname === href : pathname.startsWith(href);

  return (
    <>
      <aside className="ng-desktop-sidebar hidden md:flex">
        <Link href="/feed" className="mb-8 px-2"><NightGramWordmark size={30} /></Link>
        <nav className="flex w-full flex-1 flex-col gap-2">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cn("ng-sidebar-link", isActive(href) && "is-active")}>
              <Icon size={20} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto w-full space-y-2">
          <Link href="/notifications" className={cn("ng-sidebar-link", pathname.startsWith("/notifications") && "is-active")}>
            <span className="relative"><Bell size={20} />{unreadCount > 0 && <b className="ng-dot" />}</span><span>Уведомления</span>
          </Link>
          <Link href="/settings" className={cn("ng-sidebar-link", pathname.startsWith("/settings") && "is-active")}><Settings size={20} /><span>Настройки</span></Link>
          <Link href={profileHref} className="ng-profile-card">
            <GlowAvatar src={user.avatarUrl} alt={user.username} size={40} glow={user.glowEffect ?? undefined} frame={user.avatarFrame ?? undefined} />
            <span className="min-w-0"><strong className="block truncate text-sm">{user.displayName || user.username}</strong><small className="block truncate text-white/40">@{user.username}</small></span>
          </Link>
          <button onClick={async () => { await logout(); router.replace("/"); }} className="ng-sidebar-link w-full text-red-300"><LogOut size={20} /><span>Выйти</span></button>
        </div>
      </aside>

      <header className="ng-mobile-header md:hidden">
        <NightGramWordmark size={27} />
        <div className="flex items-center gap-2">
          <Link href="/notifications" className="ng-mobile-action relative"><Bell size={19} />{unreadCount > 0 && <b className="ng-dot" />}</Link>
          <Link href={profileHref}><GlowAvatar src={user.avatarUrl} alt={user.username} size={34} /></Link>
        </div>
      </header>

      <nav className="ng-mobile-tabs md:hidden">
        {links.slice(0, 4).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={cn("ng-mobile-tab", isActive(href) && "is-active")}><Icon size={21} /><span>{label}</span></Link>
        ))}
        <Link href={profileHref} className={cn("ng-mobile-tab", pathname.startsWith("/profile") && "is-active")}><User size={21} /><span>Профиль</span></Link>
      </nav>
    </>
  );
}
