"use client";

// =============================================================================
//  Badge — reusable component for role and premium badges
//  - Profile: pill with icon + title, tooltip on hover
//  - Posts/comments/messages: compact icon with tooltip
// =============================================================================

import { Crown, Shield, Star, Headphones, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string; desc: string }> = {
  owner: {
    icon: Crown,
    color: "#7c3aed",
    label: "Владелец",
    desc: "Создатель NightGram.",
  },
  co_owner: {
    icon: Crown,
    color: "#a855f7",
    label: "Заместитель владельца",
    desc: "Помогает с важными делами в NightGram.",
  },
  admin: {
    icon: Shield,
    color: "#ef4444",
    label: "Администратор",
    desc: "Руководит стаффом.",
  },
  moderator: {
    icon: Shield,
    color: "#3b82f6",
    label: "Модератор",
    desc: "Следит за порядком.",
  },
  support: {
    icon: Headphones,
    color: "#22d3ee",
    label: "Поддержка",
    desc: "Помогает пользователям с вопросами.",
  },
  creator: {
    icon: Star,
    color: "#ec4899",
    label: "Контент-мейкер",
    desc: "Официальный создатель контента.",
  },
  user: {
    icon: User,
    color: "#9ca3af",
    label: "Пользователь",
    desc: "Участник NightGram.",
  },
};

const PREMIUM_CONFIG = {
  icon: Crown,
  color: "#fbbf24",
  label: "Premium",
  desc: "Подписка на нашем сайте, даёт уникальные возможности.",
};

// ===== Role Badge =====

export function RoleBadge({
  role,
  size = 16,
  showLabel = false,
  className,
}: {
  role: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.user;
  return (
    <BadgeContent
      icon={config.icon}
      color={config.color}
      label={config.label}
      desc={config.desc}
      size={size}
      showLabel={showLabel}
      className={className}
    />
  );
}

// ===== Premium Badge (compact, for posts/comments/messages) =====

export function PremiumBadge({
  size = 16,
  showLabel = false,
  className,
}: {
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <BadgeContent
      icon={PREMIUM_CONFIG.icon}
      color={PREMIUM_CONFIG.color}
      label={PREMIUM_CONFIG.label}
      desc={PREMIUM_CONFIG.desc}
      size={size}
      showLabel={showLabel}
      className={className}
    />
  );
}

// ===== Shared badge renderer =====

function BadgeContent({
  icon: Icon,
  color,
  label,
  desc,
  size = 16,
  showLabel = false,
  className,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  desc: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  // --- Profile mode: pill with icon + title ---
  if (showLabel) {
    return (
      <div
        className={cn(
          "group relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 shrink-0",
          className,
        )}
        style={{
          background: `${color}15`,
          border: `1px solid ${color}40`,
          boxShadow: `0 0 12px ${color}22`,
        }}
      >
        <Icon size={size} style={{ color, fill: color }} />
        <span className="text-xs font-semibold" style={{ color }}>
          {label}
        </span>

        {/* Tooltip — anchored right to stay within card */}
        <div className="pointer-events-none absolute top-full right-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 w-48">
          <div className="ng-solid rounded-xl p-3 shadow-glow-lg">
            <div className="font-semibold text-xs mb-1 flex items-center gap-1.5" style={{ color }}>
              <Icon size={12} /> {label}
            </div>
            <p className="text-[11px] text-white/65 leading-relaxed">{desc}</p>
          </div>
        </div>
      </div>
    );
  }

  // --- Compact mode (posts, comments, messages): icon only ---
  return (
    <span className={cn("group relative inline-flex items-center shrink-0", className)}>
      <span
        className="grid place-items-center rounded-full transition"
        style={{
          width: size + 6,
          height: size + 6,
          background: `${color}22`,
          boxShadow: `0 0 8px ${color}44`,
        }}
      >
        <Icon
          size={size - 2}
          style={{ color, fill: color }}
          className="pointer-events-none"
        />
      </span>

      {/* Tooltip — anchored left to stay within post cards */}
      <div className="pointer-events-none absolute top-full left-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity z-50 w-48">
        <div className="ng-solid rounded-xl p-3 shadow-glow-lg">
          <div className="font-semibold text-xs mb-1 flex items-center gap-1.5" style={{ color }}>
            <Icon size={12} /> {label}
          </div>
          <p className="text-[11px] text-white/65 leading-relaxed">{desc}</p>
        </div>
      </div>
    </span>
  );
}
