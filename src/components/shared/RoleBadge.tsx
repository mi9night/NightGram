"use client";

// =============================================================================
//  Badge — reusable component for role and premium badges
//  - Profile: pill with icon + title, tooltip on hover
//  - Posts/comments/messages: compact icon with tooltip
// =============================================================================

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crown, Shield, Star, Headphones, User, CircleCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string; desc: string }> = {
  owner: {
    icon: Crown,
    color: "#7c3aed",
    label: "Owner",
    desc: "Создатель NightGram.",
  },
  co_owner: {
    icon: Crown,
    color: "#a855f7",
    label: "Co-Owner",
    desc: "Помогает с важными делами в NightGram.",
  },
  admin: {
    icon: Shield,
    color: "#ef4444",
    label: "Administrator",
    desc: "Руководит стаффом.",
  },
  moderator: {
    icon: Shield,
    color: "#3b82f6",
    label: "Moderator",
    desc: "Следит за порядком.",
  },
  support: {
    icon: Headphones,
    color: "#22d3ee",
    label: "Support",
    desc: "Помогает пользователям с вопросами.",
  },
  creator: {
    icon: Star,
    color: "#ec4899",
    label: "Creator",
    desc: "Официальный создатель контента.",
  },
  user: {
    icon: User,
    color: "#9ca3af",
    label: "User",
    desc: "Участник NightGram.",
  },
};


const VERIFIED_CONFIG = {
  icon: CircleCheck,
  color: "#38bdf8",
  label: "Верифицирован",
  desc: "Верифицированный пользователь NightGram.",
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
  disableTooltip = false,
}: {
  role: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
  disableTooltip?: boolean;
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
      disableTooltip={disableTooltip}
    />
  );
}

// ===== Premium Badge (compact, for posts/comments/messages) =====

export function PremiumBadge({
  size = 16,
  showLabel = false,
  className,
  disableTooltip = false,
}: {
  size?: number;
  showLabel?: boolean;
  className?: string;
  disableTooltip?: boolean;
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
      disableTooltip={disableTooltip}
    />
  );
}


// ===== Verified Badge =====
export function VerifiedBadge({
  size = 16,
  showLabel = false,
  className,
  disableTooltip = false,
}: {
  size?: number;
  showLabel?: boolean;
  className?: string;
  disableTooltip?: boolean;
}) {
  return (
    <BadgeContent
      icon={VERIFIED_CONFIG.icon}
      color={VERIFIED_CONFIG.color}
      label={VERIFIED_CONFIG.label}
      desc={VERIFIED_CONFIG.desc}
      size={size}
      showLabel={showLabel}
      className={className}
      disableTooltip={disableTooltip}
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
  disableTooltip = false,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  desc: string;
  size?: number;
  showLabel?: boolean;
  className?: string;
  disableTooltip?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!hovered || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = 240;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
    const top = Math.min(rect.bottom + 10, window.innerHeight - 130);
    setPos({ top: Math.max(8, top), left });
  }, [hovered, label]);

  const tooltip = !disableTooltip && mounted && hovered ? createPortal(
    <div
      className="pointer-events-none fixed z-[120500] w-60 rounded-2xl border border-white/10 bg-[#100a24]/96 p-3 text-left shadow-glow-lg backdrop-blur-xl"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold whitespace-normal" style={{ color }}>
        <Icon size={12} /> {label}
      </div>
      <p className="text-[11px] leading-relaxed text-white/68 whitespace-normal break-words">{desc}</p>
    </div>,
    document.body,
  ) : null;

  const triggerProps = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => setHovered(false),
    title: desc,
  };

  // --- Profile mode: pill with icon + title ---
  if (showLabel) {
    return (
      <div
        ref={(node) => { ref.current = node; }}
        {...triggerProps}
        className={cn(
          "relative inline-flex items-center gap-2 rounded-full px-3 py-1.5 shrink-0",
          className,
        )}
        style={{
          background: `${color}15`,
          border: `1px solid ${color}40`,
          boxShadow: `0 0 12px ${color}22`,
        }}
      >
        <Icon size={size} style={{ color, fill: label === "Верифицирован" ? "none" : color }} />
        <span className="text-xs font-semibold whitespace-nowrap" style={{ color }}>
          {label}
        </span>
        {tooltip}
      </div>
    );
  }

  // --- Compact mode (posts, comments, messages): icon only ---
  return (
    <span ref={(node) => { ref.current = node; }} {...triggerProps} className={cn("relative inline-flex items-center shrink-0", className)}>
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
          style={{ color, fill: label === "Верифицирован" ? "none" : color }}
          className="pointer-events-none"
        />
      </span>
      {tooltip}
    </span>
  );
}
