import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a big number: 1200 -> "1.2K", 1500000 -> "1.5M". */
export function formatCount(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return "0";
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
}

/** Relative time in a short, human-friendly form (RU/EN aware of layout). */
export function timeAgo(iso: string): string {
  const date = new Date(iso).getTime();
  const diff = Date.now() - date;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} д`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} нед`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} мес`;
  return `${Math.floor(day / 365)} г`;
}

/** Clock time for messages: "14:05". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format NightCoins as "1 200 ✦". */
export function formatCoins(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Delay helper. */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stable pseudo-random id for client optimistic data. */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Throttle for typing / scroll handlers. */
export function throttle<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

/** Returns a CSS text-shadow / glow string for a hex color. */
export function glowFor(color: string, intensity = 1): string {
  return `0 0 ${8 * intensity}px ${color}aa, 0 0 ${20 * intensity}px ${color}66`;
}
