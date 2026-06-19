"use client";

// =============================================================================
//  RoleBadge — shows user role as an icon with tooltip
//  Used in posts, comments, messages (icon only, tooltip on hover)
// =============================================================================

import { Crown, Shield, Star, Headphones, User, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  owner: { icon: Crown, color: "#fbbf24", label: "Owner" },
  co_owner: { icon: Crown, color: "#a855f7", label: "Co-Owner" },
  admin: { icon: Shield, color: "#ef4444", label: "Admin" },
  moderator: { icon: Shield, color: "#3b82f6", label: "Moderator" },
  support: { icon: Headphones, color: "#22d3ee", label: "Support" },
  creator: { icon: Star, color: "#ec4899", label: "Creator" },
  user: { icon: User, color: "#9ca3af", label: "User" },
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

  return (
    <span
      className={cn("group relative inline-flex items-center gap-1 shrink-0", className)}
    >
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

      {showLabel && (
        <span className="text-xs font-semibold" style={{ color: config.color }}>
          {config.label}
        </span>
      )}

      {/* Tooltip on hover */}
      <div className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
        <div className="ng-solid rounded-lg px-2.5 py-1 text-[10px] font-semibold shadow-glow-lg" style={{ color: config.color }}>
          {config.label}
        </div>
      </div>
    </span>
  );
}
