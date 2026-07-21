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
  const frameBase = ringColor && ringColor !== "#0e0a22" ? ringColor : "var(--accent-main)";
  const dualColors = frame?.startsWith("dual:") ? frame.split(":") : null;
  const solidColor = frame?.startsWith("solid:") ? frame.slice("solid:".length) : null;
  const frameGradient = frame === "rainbow"
    ? "conic-gradient(from 0deg,#ef4444,#f97316,#facc15,#22c55e,#06b6d4,#6366f1,#ec4899,#ef4444)"
    : frame === "verified"
      ? "conic-gradient(from 0deg,#38bdf8,#2563eb,#22d3ee,#1d4ed8,#38bdf8)"
      : frame === "aurora"
        ? "conic-gradient(from 0deg,#2dd4bf,#8b5cf6,#38bdf8,#34d399,#2dd4bf)"
        : frame === "prism"
          ? "conic-gradient(from 0deg,#f472b6,#a78bfa,#22d3ee,#fde047,#f472b6)"
          : frame === "cosmic"
            ? "conic-gradient(from 0deg,#020617,#4c1d95,#ec4899,#38bdf8,#020617)"
            : frame === "fire"
              ? "conic-gradient(from 0deg,#ef4444,#f97316,#fbbf24,#fb7185,#ef4444)"
              : frame === "ice"
                ? "conic-gradient(from 0deg,#bae6fd,#60a5fa,#22d3ee,#f8fafc,#bae6fd)"
                : frame === "premium"
                  ? "conic-gradient(from 0deg,#fbbf24,#f59e0b,#fff7ad,#fbbf24)"
                  : frame === "gradient"
                    ? `conic-gradient(from 0deg, ${frameBase}, color-mix(in srgb, ${frameBase} 55%, white), ${frameBase}, color-mix(in srgb, ${frameBase} 55%, black), ${frameBase})`
                    : solidColor
                      ? `conic-gradient(from 0deg, ${solidColor}, color-mix(in srgb, ${solidColor} 62%, white), ${solidColor}, color-mix(in srgb, ${solidColor} 70%, black), ${solidColor})`
                      : dualColors
                        ? `conic-gradient(from 0deg, ${dualColors[1] || frameBase}, ${dualColors[2] || "#ec4899"}, ${dualColors[1] || frameBase})`
                        : "conic-gradient(from 0deg, var(--accent-main), var(--accent-tertiary), #22d3ee, var(--accent-main))";

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
            background: frameGradient,
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
