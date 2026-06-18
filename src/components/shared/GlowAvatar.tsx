"use client";

// =============================================================================
//  GlowAvatar — avatar with optional premium frame + glow halo.
// =============================================================================

import { cn } from "@/lib/utils";

export function GlowAvatar({
  src,
  alt,
  size = 48,
  frame,
  glow,
  ringColor = "var(--accent-main)",
  online,
  className,
}: {
  src: string | null;
  alt: string;
  size?: number;
  frame?: string | null;
  glow?: string | null;
  ringColor?: string;
  online?: boolean;
  className?: string;
}) {
  const glowColor =
    glow === "pink" ? "#ec4899" : glow === "cyan" ? "#22d3ee" : glow === "gold" ? "#fbbf24" : "var(--accent-main)";

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* glow halo */}
      <div
        className="absolute -inset-1 rounded-full opacity-70 blur-md animate-pulse-glow"
        style={{ background: `radial-gradient(circle, ${glowColor}, transparent 70%)` }}
        aria-hidden
      />

      {/* animated frame ring */}
      {frame && (
        <div
          className="absolute -inset-[3px] rounded-full"
          style={{
            background: "conic-gradient(from 0deg, var(--accent-main), var(--accent-tertiary), #22d3ee, var(--accent-main))",
            animation: "spin 6s linear infinite",
          }}
          aria-hidden
        />
      )}

      <div
        className="relative rounded-full overflow-hidden bg-midnight-700"
        style={{
          width: size,
          height: size,
          border: frame ? "3px solid #0e0a22" : `2px solid ${ringColor}66`,
          boxShadow: glow
            ? `0 0 12px ${glowColor}aa, inset 0 0 8px ${glowColor}44`
            : undefined,
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full grid place-items-center font-display font-bold text-white/80"
               style={{ background: "linear-gradient(135deg,#2e2354,#160f30)" }}>
            {alt.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {online !== undefined && (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-2 border-midnight-900",
            online ? "bg-green-400" : "bg-gray-500",
          )}
          style={{ width: Math.max(10, size * 0.22), height: Math.max(10, size * 0.22) }}
        />
      )}
    </div>
  );
}
