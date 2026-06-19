"use client";

// =============================================================================
//  RoleBadge — shows user role as a badge
//  - In profile: pill with icon + title + description
//  - In posts/comments/messages: icon only, tooltip with title + description
// =============================================================================

import { Crown, Shield, Star, Headphones, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string; desc: string }> = {
  owner: {
    icon: Crown,
    color: "#fbbf24",
    label: "Владелец",
    desc: "Создатель и владелец NightGram. Полный доступ ко всем функциям.",
  },
  co_owner: {
    icon: Crown,
    color: "#a855f7",
    label: "Зам. владельца",
    desc: "Заместитель владельца. Может управлять ролями и модерацией.",
  },
  admin: {
    icon: Shield,
    color: "#ef4444",
    label: "Администратор",
    desc: "Управляет пользователями, выдаёт наказания и одобряет покупки.",
  },
  moderator: {
    icon: Shield,
    color: "#3b82f6",
    label: "Модератор",
    desc: "Следит за порядком: тикеты, жалобы, баны и муты.",
  },
  support: {
    icon: Headphones,
    color: "#22d3ee",
    label: "Поддержка",
    desc: "Помогает пользователям с вопросами и проблемами.",
  },
  creator: {
    icon: Star,
    color: "#ec4899",
    label: "Контент-мейкер",
    desc: "Официальный создатель контента на платформе.",
  },
  user: {
    icon: User,
    color: "#9ca3af",
    label: "Пользователь",
    desc: "Обычный участник NightGram.",
  },
};

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
  const Icon = config.icon;

  // --- Profile mode: full pill with title + description ---
  if (showLabel) {
    return (
      <div
        className={cn(
          "group relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 shrink-0",
          className,
        )}
        style={{
          background: `${config.color}15`,
          border: `1px solid ${config.color}40`,
          boxShadow: `0 0 12px ${config.color}22`,
        }}
      >
        <Icon size={size} style={{ color: config.color, fill: config.color }} />
        <span className="text-xs font-semibold" style={{ color: config.color }}>
          {config.label}
        </span>

        {/* Tooltip with title + description */}
        <div className="pointer-events-none absolute top-full left-0 mt-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 w-56">
          <div className="ng-solid rounded-xl p-3 shadow-glow-lg">
            <div className="font-semibold text-xs mb-1 flex items-center gap-1.5" style={{ color: config.color }}>
              <Icon size={12} /> {config.label}
            </div>
            <p className="text-[11px] text-white/65 leading-relaxed">{config.desc}</p>
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
          background: `${config.color}22`,
          boxShadow: `0 0 8px ${config.color}44`,
        }}
      >
        <Icon
          size={size - 2}
          style={{ color: config.color, fill: config.color }}
          className="pointer-events-none"
        />
      </span>

      {/* Tooltip with title + description */}
      <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
        <div className="ng-solid rounded-xl p-3 shadow-glow-lg w-52">
          <div className="font-semibold text-xs mb-1 flex items-center gap-1.5" style={{ color: config.color }}>
            <Icon size={12} /> {config.label}
          </div>
          <p className="text-[11px] text-white/65 leading-relaxed">{config.desc}</p>
        </div>
      </div>
    </span>
  );
}
