// =============================================================================
//  NightGram Web — Backend API client (Node.js + Express)
//  Talks to the shared backend that also powers the mobile app.
//  Includes snake_case → camelCase normalization for all responses.
// =============================================================================

import type {
  AppNotification,
  CallHistoryEntry,
  AuthSession,
  AuthDeviceSession,
  TwoFactorLoginChallenge,
  TwoFactorActionChallenge,
  TwoFactorConfirmResult,
  TwoFactorRecoveryRequest,
  SecurityEvent,
  Comment,
  Conversation,
  GlobalSearchResponse,
  GlobalSearchType,
  Message,
  ScheduledMessage,
  Post,
  StoreItem,
  User,
} from "@/types";
import { normalizeNotificationSettings } from "@/lib/notificationPreferences";

export const DEFAULT_API_URL = "https://nightgram-production-0ceb.up.railway.app/api";
const CONFIGURED_API_URL = (process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 20000;

export type CallIceConfig = {
  iceServers: RTCIceServer[];
  turnEnabled: boolean;
  expiresAt: string | null;
};

export type MessagePage = {
  messages: Message[];
  hasMore: boolean;
  nextBefore: string | null;
  nextAfter: string | null;
};

// Collapse identical simultaneous GET requests. React effects and route transitions can
// otherwise request the same feed/conversation data more than once.
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const recentGetResponses = new Map<string, { expiresAt: number; value: unknown }>();
const RECENT_GET_TTL_MS = 1500;
let refreshPromise: Promise<boolean> | null = null;

function pruneRecentGetResponses(now = Date.now()): void {
  if (recentGetResponses.size < 80) return;
  for (const [key, entry] of recentGetResponses) {
    if (entry.expiresAt <= now) recentGetResponses.delete(key);
  }
}

// Browser and Electron requests go through the bundled same-origin Next.js proxy.
// This avoids CORS restrictions and guarantees that packaged builds use the
// current Railway address instead of a value embedded in an older client chunk.
function primaryApiBase(): string {
  return isBrowser() ? "/api/backend" : CONFIGURED_API_URL;
}

const ACCESS_COOKIE = "ng_access_token";
const REFRESH_COOKIE = "ng_refresh_token";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function cookieSecureSuffix(): string {
  return isBrowser() && window.location.protocol === "https:" ? "; Secure" : "";
}

function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const prefix = `${name}=`;
  const item = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(prefix.length));
  } catch {
    return item.slice(prefix.length);
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (!isBrowser()) return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.max(1, Math.floor(maxAgeSeconds))}; SameSite=Lax${cookieSecureSuffix()}`;
}

function deleteCookie(name: string): void {
  if (!isBrowser()) return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecureSuffix()}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

function jwtMaxAgeSeconds(token: string | null, fallbackSeconds: number): number {
  if (!token) return fallbackSeconds;
  try {
    const payload = decodeJwtPayload(token);
    if (typeof payload.exp === "number") {
      return Math.max(1, payload.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    /* ignore malformed tokens — fallback keeps the UX working */
  }
  return fallbackSeconds;
}

export function getStoredAccessToken(): string | null {
  if (!isBrowser()) return null;
  const local = localStorage.getItem(ACCESS_COOKIE);
  const cookie = readCookie(ACCESS_COOKIE);
  if (!local && cookie) localStorage.setItem(ACCESS_COOKIE, cookie);
  return local || cookie;
}

export function getStoredRefreshToken(): string | null {
  if (!isBrowser()) return null;
  const local = localStorage.getItem(REFRESH_COOKIE);
  const cookie = readCookie(REFRESH_COOKIE);
  if (!local && cookie) localStorage.setItem(REFRESH_COOKIE, cookie);
  return local || cookie;
}

export function persistAuthTokens(accessToken: string, refreshToken?: string | null): void {
  if (!isBrowser()) return;
  localStorage.setItem(ACCESS_COOKIE, accessToken);
  writeCookie(ACCESS_COOKIE, accessToken, jwtMaxAgeSeconds(accessToken, 15 * 60));

  if (refreshToken) {
    localStorage.setItem(REFRESH_COOKIE, refreshToken);
    writeCookie(REFRESH_COOKIE, refreshToken, jwtMaxAgeSeconds(refreshToken, 7 * 24 * 60 * 60));
  }
}

export function clearStoredAuth(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_COOKIE);
  localStorage.removeItem(REFRESH_COOKIE);
  localStorage.removeItem("ng_cached_user");
  deleteCookie(ACCESS_COOKIE);
  deleteCookie(REFRESH_COOKIE);
}

// ---- snake_case → camelCase converter -------------------------------------

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function normalize<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map(normalize) as T;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const camelKey = toCamelCase(key);
      result[camelKey] = normalize(value);
    }
    return result as T;
  }
  return obj as T;
}

function normalizeNotification(raw: unknown): AppNotification {
  const n = normalize<Record<string, unknown>>(raw);
  return {
    id: String(n.id ?? ""),
    type: (n.type as AppNotification["type"]) ?? "system",
    title: String(n.title ?? ""),
    body: String(n.body ?? ""),
    avatarUrl: (n.avatarUrl as string) ?? null,
    actorId: (n.actorId as string) ?? null,
    actionType: (n.actionType as string) ?? null,
    read: Boolean(n.read ?? false),
    createdAt: String(n.createdAt ?? new Date().toISOString()),
  };
}

export function normalizeMessage(raw: unknown): Message {
  const m = normalize<Record<string, unknown>>(raw);
  const replyRaw = m.replyTo;
  let replyTo: Message["replyTo"] = null;

  if (replyRaw && typeof replyRaw === "object") {
    const r = replyRaw as Record<string, unknown>;
    replyTo = {
      id: String(r.id ?? ""),
      text: r.text === null || r.text === undefined ? undefined : String(r.text),
      senderId: String(r.senderId ?? ""),
    };
  } else if (typeof replyRaw === "string" && replyRaw) {
    replyTo = { id: replyRaw, text: "", senderId: "" };
  }

  const reactions = Array.isArray(m.reactions)
    ? m.reactions.map((reaction) => {
        const r = normalize<Record<string, unknown>>(reaction);
        return {
          emoji: String(r.emoji ?? ""),
          userIds: Array.isArray(r.userIds) ? r.userIds.map(String) : [],
        };
      }).filter((reaction) => reaction.emoji)
    : [];

  const senderRaw = m.sender && typeof m.sender === "object" ? normalize<Record<string, unknown>>(m.sender) : null;
  const pollRaw = m.poll && typeof m.poll === "object" ? normalize<Record<string, unknown>>(m.poll) : null;
  const poll = pollRaw ? {
    id: String(pollRaw.id ?? ""),
    question: String(pollRaw.question ?? m.text ?? "Опрос"),
    allowMultiple: Boolean(pollRaw.allowMultiple ?? false),
    anonymous: Boolean(pollRaw.anonymous ?? true),
    closedAt: pollRaw.closedAt === null || pollRaw.closedAt === undefined ? null : String(pollRaw.closedAt),
    totalVotes: Number(pollRaw.totalVotes ?? 0),
    myOptionIds: Array.isArray(pollRaw.myOptionIds) ? pollRaw.myOptionIds.map(String) : [],
    options: Array.isArray(pollRaw.options) ? pollRaw.options.map((rawOption) => {
      const option = normalize<Record<string, unknown>>(rawOption);
      return {
        id: String(option.id ?? ""),
        text: String(option.text ?? "Вариант"),
        position: Number(option.position ?? 0),
        votesCount: Number(option.votesCount ?? 0),
        voterIds: Array.isArray(option.voterIds) ? option.voterIds.map(String) : undefined,
      };
    }) : [],
  } : null;

  return {
    id: String(m.id ?? ""),
    clientId: m.clientId === null || m.clientId === undefined ? undefined : String(m.clientId),
    conversationId: String(m.conversationId ?? ""),
    senderId: String(m.senderId ?? ""),
    sender: senderRaw ? {
      id: String(senderRaw.id ?? m.senderId ?? ""),
      username: String(senderRaw.username ?? ""),
      displayName: String(senderRaw.displayName ?? senderRaw.username ?? ""),
      avatarUrl: (senderRaw.avatarUrl as string) ?? null,
      nameColor: String(senderRaw.nameColor ?? "#ffffff"),
      isPremium: Boolean(senderRaw.isPremium ?? false),
      avatarFrame: (senderRaw.avatarFrame as string) ?? null,
      verified: Boolean(senderRaw.verified ?? senderRaw.avatarFrame === "verified"),
      isOnline: Boolean(senderRaw.isOnline ?? false),
    } : undefined,
    text: m.text === null || m.text === undefined ? undefined : String(m.text),
    type: (m.type as Message["type"]) ?? "text",
    attachmentUrl: (m.attachmentUrl as string) ?? undefined,
    attachmentThumbnailUrl: (m.attachmentThumbnailUrl as string) ?? undefined,
    mediaWidth: typeof m.mediaWidth === "number" ? m.mediaWidth : undefined,
    mediaHeight: typeof m.mediaHeight === "number" ? m.mediaHeight : undefined,
    mediaDurationSec: typeof m.mediaDurationSec === "number" ? m.mediaDurationSec : undefined,
    replyTo,
    reactions,
    status: (m.status as Message["status"]) ?? "sent",
    deliveredTo: Array.isArray(m.deliveredTo) ? m.deliveredTo.map(String) : [],
    readBy: Array.isArray(m.readBy) ? m.readBy.map(String) : [],
    createdAt: String(m.createdAt ?? new Date().toISOString()),
    editedAt: m.editedAt === null || m.editedAt === undefined ? null : String(m.editedAt),
    deletedAt: m.deletedAt === null || m.deletedAt === undefined ? null : String(m.deletedAt),
    pinnedAt: m.pinnedAt === null || m.pinnedAt === undefined ? null : String(m.pinnedAt),
    pinnedBy: m.pinnedBy === null || m.pinnedBy === undefined ? null : String(m.pinnedBy),
    poll,
    mentionedUserIds: Array.isArray(m.mentionedUserIds) ? m.mentionedUserIds.map(String) : [],
  };
}

function normalizeConversation(raw: unknown): Conversation {
  const c = normalize<Record<string, unknown>>(raw);
  const participants = Array.isArray(c.participants)
    ? c.participants.map((participant) => {
        const p = normalize<Record<string, unknown>>(participant);
        return {
          id: String(p.id ?? ""),
          username: String(p.username ?? ""),
          displayName: String(p.displayName ?? p.username ?? ""),
          avatarUrl: (p.avatarUrl as string) ?? null,
          nameColor: String(p.nameColor ?? "#ffffff"),
          role: (p.role as Conversation["participants"][number]["role"]) ?? "member",
          appRole: (p.appRole as User["role"]) ?? (p.userRole as User["role"]) ?? undefined,
          isPremium: Boolean(p.isPremium ?? false),
          avatarFrame: (p.avatarFrame as string) ?? null,
          verified: Boolean(p.verified ?? p.isVerified ?? p.avatarFrame === "verified"),
          isOnline: Boolean(p.isOnline ?? false),
          lastSeen: (p.lastSeen as string) ?? null,
          nightStatusText: (p.nightStatusText as string) ?? null,
          nightStatusEmoji: (p.nightStatusEmoji as string) ?? null,
          nightStatusExpiresAt: (p.nightStatusExpiresAt as string) ?? null,
        };
      })
    : [];

  return {
    id: String(c.id ?? ""),
    type: (c.type as Conversation["type"]) ?? "direct",
    title: String(c.title ?? ""),
    avatarUrl: (c.avatarUrl as string) ?? null,
    description: c.description === null || c.description === undefined ? null : String(c.description),
    participants,
    lastMessage: c.lastMessage ? normalizeMessage(c.lastMessage) : null,
    unreadCount: Number(c.unreadCount ?? 0),
    mentionCount: Number(c.mentionCount ?? 0),
    skippedPrivacyCount: Number(c.skippedPrivacyCount ?? 0),
    pinned: Boolean(c.pinned ?? false),
    muted: Boolean(c.muted ?? false),
    archived: Boolean(c.archived ?? false),
    requestStatus: (c.requestStatus as Conversation["requestStatus"]) ?? "accepted",
    favorite: Boolean(c.favorite ?? false),
    folder: (c.folder as Conversation["folder"]) ?? "all",
    appRole: (c.appRole as User["role"]) ?? undefined,
    isPremium: Boolean(c.isPremium ?? false),
    avatarFrame: (c.avatarFrame as string) ?? null,
    verified: Boolean(c.verified ?? false),
    isOnline: Boolean(c.isOnline ?? false),
    lastSeen: (c.lastSeen as string) ?? null,
    nightStatusText: (c.nightStatusText as string) ?? null,
    nightStatusEmoji: (c.nightStatusEmoji as string) ?? null,
    nightStatusExpiresAt: (c.nightStatusExpiresAt as string) ?? null,
  };
}

function normalizeUser(raw: unknown): User {
  const u = normalize<Record<string, unknown>>(raw);
  return {
    id: String(u.id ?? ""),
    ngId: Number(u.ngId ?? 10000001),
    customId: (u.customId as string) ?? null,
    username: String(u.username ?? ""),
    displayName: String(u.displayName ?? u.username ?? ""),
    email: String(u.email ?? ""),
    avatarUrl: (u.avatarUrl as string) ?? null,
    bannerUrl: (u.bannerUrl as string) ?? null,
    bio: String(u.bio ?? ""),
    nameColor: String(u.nameColor ?? "#ffffff"),
    nameColorId: String(u.nameColorId ?? "light"),
    isPremium: Boolean(u.isPremium ?? false),
    premiumUntil: (u.premiumUntil as string) ?? null,
    verified: Boolean(u.verified ?? u.isVerified ?? u.avatarFrame === "verified"),
    glowEffect: (u.glowEffect as string) ?? null,
    avatarFrame: (u.avatarFrame as string) ?? null,
    nightCoins: Number(u.nightCoins ?? 0),
    boostBalance: Number(u.boostBalance ?? 0),
    followersCount: Number(u.followersCount ?? 0),
    followingCount: Number(u.followingCount ?? 0),
    postsCount: Number(u.postsCount ?? 0),
    createdAt: String(u.createdAt ?? new Date().toISOString()),
    role: (u.role as User["role"]) ?? "user",
    ownedItems: (u.ownedItems as string[]) ?? [],
    notificationSettings: normalizeNotificationSettings(u.notificationSettings as Partial<User["notificationSettings"]> | null),
    hideSocial: Boolean(u.hideSocial ?? false),
    hidePurchases: Boolean(u.hidePurchases ?? false),
    privacyProfile: (u.privacyProfile as User["privacyProfile"]) ?? "everyone",
    privacyMessages: (u.privacyMessages as User["privacyMessages"]) ?? "everyone",
    privacyGroups: (u.privacyGroups as User["privacyGroups"]) ?? "everyone",
    privacyLastSeen: (u.privacyLastSeen as User["privacyLastSeen"]) ?? "everyone",
    hideReadReceipts: Boolean(u.hideReadReceipts ?? false),
    filterUnknownMessages: u.filterUnknownMessages !== false,
    twoFactorEnabled: Boolean(u.twoFactorEnabled ?? false),
    twoFactorBackupCodesRemaining: Number(u.twoFactorBackupCodesRemaining ?? 0),
    profileRestricted: Boolean(u.profileRestricted ?? false),
    deletionRequestedAt: (u.deletionRequestedAt as string) ?? null,
    deletionScheduledAt: (u.deletionScheduledAt as string) ?? null,
    deletedAt: (u.deletedAt as string) ?? null,
    isOnline: Boolean(u.isOnline ?? false),
    lastSeen: (u.lastSeen as string) ?? null,
    nightStatusText: (u.nightStatusText as string) ?? null,
    nightStatusEmoji: (u.nightStatusEmoji as string) ?? null,
    nightStatusExpiresAt: (u.nightStatusExpiresAt as string) ?? null,
    musicArtist: (u.musicArtist as string) ?? null,
    musicTrack: (u.musicTrack as string) ?? null,
    roomScene: (u.roomScene as User["roomScene"]) ?? null,
    activeBan: (u.activeBan as User["activeBan"]) ?? null,
  };
}

// ---- fetch wrapper ---------------------------------------------------------

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 18000): Promise<Response> {
  // Do not abort the fetch signal here. Some browsers surface AbortController
  // timeouts as the scary raw error: "signal is aborted without reason".
  // Racing gives us a clean app-level error while the browser cleans up the
  // abandoned request in the background.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<Response>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Сервер долго отвечает. Railway может просыпаться — попробуйте ещё раз через несколько секунд."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fetch(input, init), timeout]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("aborted") || message.includes("AbortError")) {
      throw new Error("Запрос был прерван. Попробуйте ещё раз.");
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isTransientNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Сервер долго отвечает")
    || message.includes("Запрос был прерван")
    || message.includes("Failed to fetch")
    || message.includes("NetworkError")
    || message.includes("aborted")
    || message.includes("Load failed");
}

function deviceRequestHeaders(): Record<string, string> {
  if (!isBrowser()) return {};

  const ua = navigator.userAgent.toLowerCase();
  let platform = "web";

  if (window.nightgramDesktop) platform = "windows-desktop";
  else if (ua.includes("android")) platform = "android";
  else if (/iphone|ipad|ipod/.test(ua)) platform = "ios";
  else if (ua.includes("windows")) platform = "windows-web";
  else if (ua.includes("mac os")) platform = "macos-web";
  else if (ua.includes("linux")) platform = "linux-web";

  const rawDeviceName = window.nightgramDesktop
    ? "NightGram for Windows"
    : `${navigator.platform || "Device"} - Browser`;

  // Fetch requires header values to stay within ISO-8859-1.
  // Restrict device metadata to printable ASCII so Cyrillic, emoji,
  // middle dots and other Unicode characters cannot break a request.
  const deviceName =
    rawDeviceName
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "NightGram Device";

  return {
    "X-NightGram-Platform": platform,
    "X-NightGram-Device-Name": deviceName,
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const token = getStoredAccessToken();
  const dedupeKey = method === "GET" ? `${token || "anonymous"}:${path}` : null;
  if (dedupeKey) {
    const now = Date.now();
    const recent = recentGetResponses.get(dedupeKey);
    if (recent && recent.expiresAt > now) return recent.value as T;
    if (recent) recentGetResponses.delete(dedupeKey);
    const existing = inFlightGetRequests.get(dedupeKey);
    if (existing) return existing as Promise<T>;
  }

  const run = async (): Promise<T> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...deviceRequestHeaders(),
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const execute = (base: string) => fetchWithTimeout(`${base}${path}`, { ...options, headers }, REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await execute(primaryApiBase());
  } catch (error) {
    // A single quiet retry smooths short Railway wake-ups and brief Wi-Fi drops.
    // Only idempotent GET requests are retried, so user actions are never duplicated.
    if (method !== "GET" || !isTransientNetworkError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    res = await execute(primaryApiBase());
  }

  if (res.status === 401 && typeof window !== "undefined") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const nextToken = getStoredAccessToken();
      if (nextToken) headers.Authorization = `Bearer ${nextToken}`;
      res = await execute(primaryApiBase());
    }
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText);
    let parsed: { error?: string; message?: string; retryAfter?: number; requestId?: string } = {};
    try { parsed = JSON.parse(raw) as typeof parsed; } catch { /* plain-text fallback */ }
    if (res.status === 429) {
      const retry = parsed.retryAfter ? ` Подожди ${parsed.retryAfter} сек.` : "";
      throw new Error(`${parsed.message || "Слишком много действий."}${retry}`);
    }
    const requestRef = parsed.requestId ? ` Код ошибки: ${parsed.requestId}.` : "";
    throw new Error(`${parsed.message || parsed.error || `Ошибка сервера (${res.status})`}${requestRef}`);
  }
    const data = await res.json() as T;
    if (dedupeKey) {
      recentGetResponses.set(dedupeKey, { expiresAt: Date.now() + RECENT_GET_TTL_MS, value: data });
      pruneRecentGetResponses();
    }
    return data;
  };

  const promise = run();
  if (dedupeKey) inFlightGetRequests.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    if (dedupeKey && inFlightGetRequests.get(dedupeKey) === promise) {
      inFlightGetRequests.delete(dedupeKey);
    }
  }
}

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh = getStoredRefreshToken();
    if (!refresh) return false;
    try {
      const res = await fetchWithTimeout(`${primaryApiBase()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...deviceRequestHeaders() },
        body: JSON.stringify({ refreshToken: refresh }),
      }, REQUEST_TIMEOUT_MS);
      if (!res.ok) return false;
      const data = await res.json();
      persistAuthTokens(data.accessToken, data.refreshToken);
      recentGetResponses.clear();
      if (isBrowser()) window.dispatchEvent(new Event("nightgram:auth-token-refresh"));
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// ---- API methods -----------------------------------------------------------

export const api = {
  async wake(): Promise<void> {
    await request<{ ok: boolean }>("/health");
  },

  async getCallIceConfig(): Promise<CallIceConfig> {
    const raw = await request<CallIceConfig>("/calls/ice-config");
    return {
      iceServers: Array.isArray(raw.iceServers) ? raw.iceServers : [],
      turnEnabled: Boolean(raw.turnEnabled),
      expiresAt: raw.expiresAt || null,
    };
  },

  async getCallHistory(limit = 50): Promise<CallHistoryEntry[]> {
    const raw = await request<unknown[]>(`/calls/history?limit=${Math.max(1, Math.min(100, limit))}`);
    return normalize<CallHistoryEntry[]>(raw || []);
  },

  async getPendingCall(): Promise<CallHistoryEntry | null> {
    const raw = await request<unknown | null>("/calls/pending");
    return raw ? normalize<CallHistoryEntry>(raw) : null;
  },

  async register(payload: {
    username: string;
    email: string;
    password: string;
    login?: string;
    displayName?: string;
  }): Promise<AuthSession> {
    const data = await request<{ accessToken: string; refreshToken: string; user: unknown }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(payload) },
    );
    return normalizeSession(data);
  },

  async checkUsername(username: string): Promise<{ username: string; available: boolean; reason?: string | null }> {
    const raw = await request<unknown>(`/auth/username/${encodeURIComponent(username)}`);
    return normalize<{ username: string; available: boolean; reason?: string | null }>(raw);
  },

  async login(payload: {
    email: string;
    password: string;
  }): Promise<AuthSession | TwoFactorLoginChallenge> {
    const data = await request<({ accessToken: string; refreshToken: string; user: unknown } | TwoFactorLoginChallenge)>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(payload) },
    );
    if (!("accessToken" in data)) return normalize<TwoFactorLoginChallenge>(data);
    return normalizeSession(data);
  },

  async verifyTwoFactorLogin(challengeToken: string, code: string): Promise<AuthSession> {
    const data = await request<{ accessToken: string; refreshToken: string; user: unknown }>("/auth/2fa/verify-login", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code }),
    });
    return normalizeSession(data);
  },

  async resendTwoFactorLogin(challengeToken: string): Promise<TwoFactorLoginChallenge> {
    const raw = await request<unknown>("/auth/2fa/resend-login", {
      method: "POST",
      body: JSON.stringify({ challengeToken }),
    });
    return normalize<TwoFactorLoginChallenge>(raw);
  },

  async requestTwoFactorAction(action: "enable" | "disable" | "regenerate", password: string): Promise<TwoFactorActionChallenge> {
    const raw = await request<unknown>("/auth/2fa/request", {
      method: "POST",
      body: JSON.stringify({ action, password }),
    });
    return normalize<TwoFactorActionChallenge>(raw);
  },

  async confirmTwoFactorAction(challengeToken: string, code: string): Promise<TwoFactorConfirmResult> {
    const raw = await request<unknown>("/auth/2fa/confirm", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code }),
    });
    return normalize<TwoFactorConfirmResult>(raw);
  },

  async getTwoFactorRecovery(): Promise<TwoFactorRecoveryRequest | null> {
    const raw = await request<{ recovery?: unknown | null }>("/auth/2fa/recovery");
    return raw.recovery ? normalize<TwoFactorRecoveryRequest>(raw.recovery) : null;
  },

  async requestTwoFactorRecovery(password: string): Promise<{ recovery: TwoFactorRecoveryRequest; otherSessionsRevoked: boolean }> {
    const raw = await request<{ recovery: unknown; otherSessionsRevoked: boolean }>("/auth/2fa/recovery/request", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    return { recovery: normalize<TwoFactorRecoveryRequest>(raw.recovery), otherSessionsRevoked: Boolean(raw.otherSessionsRevoked) };
  },

  async cancelTwoFactorRecovery(password: string): Promise<{ ok: boolean }> {
    return request("/auth/2fa/recovery/cancel", { method: "POST", body: JSON.stringify({ password }) });
  },

  async completeTwoFactorRecovery(password: string): Promise<{ ok: boolean; enabled: boolean }> {
    return request("/auth/2fa/recovery/complete", { method: "POST", body: JSON.stringify({ password }) });
  },

  async getSecurityEvents(limit = 40): Promise<SecurityEvent[]> {
    const raw = await request<unknown[]>(`/auth/security-events?limit=${Math.min(100, Math.max(1, limit))}`);
    return normalize<SecurityEvent[]>(raw);
  },

  async me(): Promise<User> {
    const raw = await request<unknown>("/auth/me");
    return normalizeUser(raw);
  },

  async changeEmail(email: string, password: string): Promise<User> {
    const raw = await request<unknown>("/auth/email", {
      method: "PATCH",
      body: JSON.stringify({ email, password }),
    });
    return normalizeUser(raw);
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; accessToken?: string; refreshToken?: string }> {
    const result = await request<{ ok: boolean; accessToken?: string; refreshToken?: string }>("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) });
    if (result.accessToken) persistAuthTokens(result.accessToken, result.refreshToken);
    return result;
  },

  async getAuthSessions(): Promise<AuthDeviceSession[]> {
    const raw = await request<unknown[]>("/auth/sessions");
    return normalize<AuthDeviceSession[]>(raw);
  },

  async revokeAuthSession(sessionId: string): Promise<{ ok: boolean; current?: boolean }> {
    return request(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  },

  async revokeOtherAuthSessions(): Promise<{ ok: boolean }> {
    return request("/auth/sessions/revoke-others", { method: "POST" });
  },

  async requestAccountDeletion(password: string): Promise<User> {
    const raw = await request<unknown>("/auth/delete-request", { method: "POST", body: JSON.stringify({ password }) });
    return normalizeUser(raw);
  },

  async cancelAccountDeletion(password: string): Promise<User> {
    const raw = await request<unknown>("/auth/delete-cancel", { method: "POST", body: JSON.stringify({ password }) });
    return normalizeUser(raw);
  },

  async exportAccountData(password: string): Promise<Record<string, unknown>> {
    const raw = await request<unknown>("/auth/export", { method: "POST", body: JSON.stringify({ password }) });
    return normalize<Record<string, unknown>>(raw);
  },

  async logout(): Promise<void> {
    const refresh = getStoredRefreshToken();
    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: refresh }),
    }).catch(() => {});
    clearStoredAuth();
  },

  // ---- Stories ------------------------------------------------------------
  async getStories(): Promise<unknown[]> {
  const raw = await request<unknown>("/stories");
  const normalized = normalize<unknown>(raw);

  if (Array.isArray(normalized)) {
    return normalized;
  }

  console.error("NightGram: /stories returned non-array", normalized);
  return [];
},
  async createStory(payload: { mediaUrl: string; mediaType?: "image" | "video"; text?: string; visibility?: "public" | "followers" | "circle"; circleId?: string }): Promise<unknown> {
    const raw = await request<unknown>("/stories", { method: "POST", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },
  async viewStory(storyId: string): Promise<{ ok: boolean }> {
    return request(`/stories/${storyId}/view`, { method: "POST" });
  },
  async toggleStoryLike(storyId: string): Promise<{ ok: boolean; liked: boolean }> {
    return request(`/stories/${storyId}/like`, { method: "POST" });
  },
  async getStoryLikes(storyId: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/stories/${storyId}/likes`);
    return normalize<unknown[]>(raw);
  },

  // ---- Feed ---------------------------------------------------------------

  async getFeed(
  cursor?: string,
  limit = 6,
): Promise<{ posts: Post[]; nextCursor: string | null }> {
  const qs = new URLSearchParams({ limit: String(limit) });

  if (cursor) {
    qs.set("cursor", cursor);
  }

  const raw = await request<unknown>(`/feed?${qs.toString()}`);
  const normalized = normalize<unknown>(raw);

  if (!normalized || typeof normalized !== "object") {
    console.error("NightGram: /feed returned invalid value", normalized);
    return { posts: [], nextCursor: null };
  }

  const data = normalized as Record<string, unknown>;

  return {
    posts: Array.isArray(data.posts) ? data.posts as Post[] : [],
    nextCursor:
      typeof data.nextCursor === "string"
        ? data.nextCursor
        : null,
  };
},

  async toggleLike(postId: string): Promise<{ liked: boolean; likesCount: number }> {
    const raw = await request<unknown>(`/posts/${postId}/like`, { method: "POST" });
    return normalize<{ liked: boolean; likesCount: number }>(raw);
  },

  async toggleSave(postId: string): Promise<{ saved: boolean }> {
    const raw = await request<unknown>(`/posts/${postId}/save`, { method: "POST" });
    return normalize<{ saved: boolean }>(raw);
  },

  async getComments(postId: string): Promise<Comment[]> {
    const raw = await request<unknown[]>(`/posts/${postId}/comments`);
    return normalize<Comment[]>(raw);
  },

  async addComment(postId: string, text: string, parentId?: string | null): Promise<Comment> {
    const raw = await request<unknown>(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text, parentId }),
    });
    return normalize<Comment>(raw);
  },

  async toggleCommentLike(commentId: string): Promise<{ liked: boolean; likesCount: number }> {
    const raw = await request<unknown>(`/posts/comments/${commentId}/like`, { method: "POST" });
    return normalize<{ liked: boolean; likesCount: number }>(raw);
  },

  async toggleCommentPin(commentId: string): Promise<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }> {
    const raw = await request<unknown>(`/posts/comments/${commentId}/pin`, { method: "POST" });
    return normalize<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }>(raw);
  },

  async deletePost(postId: string): Promise<{ ok: boolean }> {
    return request(`/posts/${postId}`, { method: "DELETE" });
  },

  async deleteComment(commentId: string): Promise<{ ok: boolean }> {
    return request(`/posts/comments/${commentId}`, { method: "DELETE" });
  },

  async toggleProfilePostPin(postId: string): Promise<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }> {
    const raw = await request<unknown>(`/posts/${postId}/profile-pin`, { method: "POST" });
    return normalize<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }>(raw);
  },

  async viewPost(postId: string): Promise<void> {
    await request(`/posts/${postId}/view`, { method: "POST" }).catch(() => {});
  },

  async createPost(payload: {
    text?: string;
    media?: { type: "image" | "video"; url: string; thumbnailUrl?: string; width?: number; height?: number; durationSec?: number }[];
    tags?: string[];
    authorChannelId?: string;
    visibility?: "public" | "followers" | "circle";
    circleId?: string;
    status?: "published" | "draft" | "scheduled";
    scheduledAt?: string | null;
  }): Promise<Post> {
    const raw = await request<unknown>(`/posts`, { method: "POST", body: JSON.stringify(payload) });
    return normalize<Post>(raw);
  },

  // ---- Messenger ----------------------------------------------------------

  async getConversations(): Promise<Conversation[]> {
    const raw = await request<unknown[]>("/conversations");
    return (raw || []).map(normalizeConversation);
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const raw = await request<unknown[]>(`/conversations/${conversationId}/messages`);
    return (raw || []).map(normalizeMessage);
  },

  async getPinnedMessages(conversationId: string): Promise<Message[]> {
    const raw = await request<unknown[]>(`/conversations/${conversationId}/pinned-messages`);
    return (raw || []).map(normalizeMessage);
  },
  async createPoll(conversationId: string, payload: { question: string; options: string[]; allowMultiple?: boolean; anonymous?: boolean }): Promise<Message> {
    const raw = await request<unknown>(`/conversations/${conversationId}/polls`, { method: "POST", body: JSON.stringify(payload) });
    return normalizeMessage(raw);
  },

  async votePoll(conversationId: string, messageId: string, optionIds: string[]): Promise<NonNullable<Message["poll"]>> {
    const raw = await request<unknown>(`/conversations/${conversationId}/messages/${messageId}/poll-vote`, { method: "POST", body: JSON.stringify({ optionIds }) });
    return normalize<NonNullable<Message["poll"]>>(raw);
  },

  async closePoll(conversationId: string, messageId: string): Promise<NonNullable<Message["poll"]>> {
    const raw = await request<unknown>(`/conversations/${conversationId}/messages/${messageId}/poll-close`, { method: "POST" });
    return normalize<NonNullable<Message["poll"]>>(raw);
  },


  async getScheduledMessages(conversationId: string): Promise<ScheduledMessage[]> {
    const raw = await request<unknown[]>(`/conversations/${conversationId}/scheduled`);
    return normalize<ScheduledMessage[]>(raw || []);
  },

  async scheduleMessage(conversationId: string, payload: {
    text?: string;
    type?: Message["type"];
    attachmentUrl?: string;
    attachmentThumbnailUrl?: string;
    mediaWidth?: number;
    mediaHeight?: number;
    mediaDurationSec?: number;
    replyTo?: string | null;
    scheduledAt: string;
  }): Promise<ScheduledMessage> {
    const raw = await request<unknown>(`/conversations/${conversationId}/scheduled`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalize<ScheduledMessage>(raw);
  },

  async cancelScheduledMessage(conversationId: string, scheduledMessageId: string): Promise<{ ok: boolean }> {
    return request(`/conversations/${conversationId}/scheduled/${scheduledMessageId}`, { method: "DELETE" });
  },

  async retryScheduledMessage(conversationId: string, scheduledMessageId: string): Promise<ScheduledMessage> {
    const raw = await request<unknown>(`/conversations/${conversationId}/scheduled/${scheduledMessageId}/retry`, { method: "POST" });
    return normalize<ScheduledMessage>(raw);
  },

  async toggleMessagePin(conversationId: string, messageId: string): Promise<{ ok: boolean; pinned: boolean; pinnedAt: string | null; pinnedBy: string | null }> {
    return request(`/conversations/${conversationId}/messages/${messageId}/pin`, { method: "POST" });
  },

  async getMessageContext(conversationId: string, messageId: string): Promise<Message[]> {
    const raw = await request<unknown[]>(`/conversations/${conversationId}/messages/${messageId}/context`);
    return (raw || []).map(normalizeMessage);
  },

  async getMessagesPage(
    conversationId: string,
    options: { before?: string | null; after?: string | null; limit?: number } = {},
  ): Promise<MessagePage> {
    const params = new URLSearchParams({
      paged: "1",
      limit: String(Math.min(100, Math.max(20, options.limit ?? 80))),
    });
    if (options.before) params.set("before", options.before);
    if (options.after) params.set("after", options.after);
    const raw = await request<unknown>(`/conversations/${conversationId}/messages?${params.toString()}`);
    // Compatibility with a backend that has not yet been redeployed: older
    // versions return a plain array and still remain fully usable.
    if (Array.isArray(raw)) {
      const messages = raw.map(normalizeMessage);
      return {
        messages,
        hasMore: false,
        nextBefore: messages[0]?.createdAt ?? null,
        nextAfter: messages[messages.length - 1]?.createdAt ?? null,
      };
    }
    const payload = (raw || {}) as {
      messages?: unknown[];
      hasMore?: boolean;
      nextBefore?: string | null;
      nextAfter?: string | null;
    };
    const messages = (payload.messages || []).map(normalizeMessage);
    return {
      messages,
      hasMore: Boolean(payload.hasMore),
      nextBefore: payload.nextBefore ?? messages[0]?.createdAt ?? null,
      nextAfter: payload.nextAfter ?? messages[messages.length - 1]?.createdAt ?? null,
    };
  },

  async searchUsers(q: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/users/search?q=${encodeURIComponent(q)}`);
    return normalize<unknown[]>(raw);
  },

  async globalSearch(q: string, type: GlobalSearchType = "all", limit = 12): Promise<GlobalSearchResponse> {
    const params = new URLSearchParams({ q, type, limit: String(limit) });
    const raw = await request<unknown>(`/search/global?${params.toString()}`);
    return normalize<GlobalSearchResponse>(raw);
  },

  async createGroupConversation(payload: { title: string; description?: string; avatarUrl?: string | null; userIds: string[] }): Promise<Conversation> {
    const raw = await request<unknown>("/conversations/groups", { method: "POST", body: JSON.stringify(payload) });
    return normalizeConversation(raw);
  },

  async createDirectConversation(userId: string): Promise<{ id: string } & Partial<Conversation>> {
    const raw = await request<unknown>("/conversations/direct", { method: "POST", body: JSON.stringify({ userId }) });
    return normalize<{ id: string } & Partial<Conversation>>(raw);
  },

  async updateGroupConversation(conversationId: string, payload: { title?: string; description?: string; avatarUrl?: string | null }): Promise<Conversation> {
    const raw = await request<unknown>(`/conversations/${conversationId}/group`, { method: "PATCH", body: JSON.stringify(payload) });
    return normalizeConversation(raw);
  },

  async addGroupMembers(conversationId: string, userIds: string[]): Promise<Conversation> {
    const raw = await request<unknown>(`/conversations/${conversationId}/members`, { method: "POST", body: JSON.stringify({ userIds }) });
    return normalizeConversation(raw);
  },

  async updateGroupMemberRole(conversationId: string, userId: string, role: "member" | "admin"): Promise<Conversation> {
    const raw = await request<unknown>(`/conversations/${conversationId}/members/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) });
    return normalizeConversation(raw);
  },

  async transferGroupOwnership(conversationId: string, userId: string): Promise<Conversation> {
    const raw = await request<unknown>(`/conversations/${conversationId}/transfer-owner`, { method: "POST", body: JSON.stringify({ userId }) });
    return normalizeConversation(raw);
  },

  async removeGroupMember(conversationId: string, userId: string): Promise<Conversation> {
    const raw = await request<unknown>(`/conversations/${conversationId}/members/${userId}`, { method: "DELETE" });
    return normalizeConversation(raw);
  },

  async leaveGroupConversation(conversationId: string): Promise<{ ok: boolean; removed: boolean }> {
    return request(`/conversations/${conversationId}/leave`, { method: "POST" });
  },

  async toggleConversationPin(conversationId: string): Promise<{ ok: boolean; pinned: boolean }> {
    return request(`/conversations/${conversationId}/pin`, { method: "POST" });
  },

  async toggleConversationMute(conversationId: string): Promise<{ ok: boolean; muted: boolean }> {
    return request(`/conversations/${conversationId}/mute`, { method: "POST" });
  },

  async toggleConversationArchive(conversationId: string): Promise<{ ok: boolean; archived: boolean }> {
    return request(`/conversations/${conversationId}/archive`, { method: "POST" });
  },

  async setConversationFolder(conversationId: string, folder: "all" | "work" | "friends" | "family"): Promise<{ ok: boolean; folder: "all" | "work" | "friends" | "family" }> {
    return request(`/conversations/${conversationId}/folder`, { method: "POST", body: JSON.stringify({ folder }) });
  },

  async handleConversationRequest(conversationId: string, action: "accept" | "hide" | "block"): Promise<{ ok: boolean; requestStatus: string; hidden?: boolean }> {
    return request(`/conversations/${conversationId}/request`, { method: "POST", body: JSON.stringify({ action }) });
  },

  async createConversationInvite(conversationId: string): Promise<{ code: string }> {
    return request(`/conversations/${conversationId}/invite`, { method: "POST" });
  },

  async joinConversationInvite(code: string): Promise<{ ok: boolean; conversationId: string }> {
    return request(`/conversations/invite/${encodeURIComponent(code)}/join`, { method: "POST" });
  },

  async createChannelInvite(channelId: string): Promise<{ code: string }> {
    return request(`/channels/${channelId}/invite`, { method: "POST" });
  },

  async joinChannelInvite(code: string): Promise<{ ok: boolean; channelId: string; handle: string; conversationId?: string | null }> {
    return request(`/channels/invite/${encodeURIComponent(code)}/join`, { method: "POST" });
  },

  // ---- Night Store --------------------------------------------------------

  async getStoreItems(): Promise<StoreItem[]> {
    const raw = await request<unknown[]>("/store/items");
    return normalize<StoreItem[]>(raw);
  },

  async getOwnedStoreItems(username?: string): Promise<StoreItem[]> {
    const qs = username ? `?username=${encodeURIComponent(username)}` : "";
    const raw = await request<unknown[]>(`/store/owned${qs}`);
    return normalize<StoreItem[]>(raw);
  },

  async createStoreItem(payload: Partial<StoreItem> & { name: string; description?: string; previewUrl: string }): Promise<StoreItem> {
    const raw = await request<unknown>("/admin/store/items", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalize<StoreItem>(raw);
  },

  async updateStoreItem(itemId: string, payload: Partial<StoreItem> & { previewUrl?: string }): Promise<StoreItem> {
    const raw = await request<unknown>(`/admin/store/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return normalize<StoreItem>(raw);
  },

  async deleteStoreItem(itemId: string): Promise<{ ok: boolean }> {
    return request(`/admin/store/items/${itemId}`, { method: "DELETE" });
  },

  async buyWithCoins(itemId: string): Promise<{ balance: number; owned: boolean }> {
    const raw = await request<unknown>(`/store/items/${itemId}/buy`, { method: "POST" });
    return normalize<{ balance: number; owned: boolean }>(raw);
  },

  async giftStoreItem(itemId: string, recipientId: string, message?: string): Promise<{ ok: boolean; balance: number; recipient?: unknown }> {
    const raw = await request<unknown>(`/store/items/${itemId}/gift`, { method: "POST", body: JSON.stringify({ recipientId, message }) });
    return normalize<{ ok: boolean; balance: number; recipient?: unknown }>(raw);
  },

  async applyStoreItem(itemId: string): Promise<{ ok: boolean; applied: boolean; item?: StoreItem; userPatch?: Partial<User>; effect?: string }> {
    const raw = await request<unknown>(`/store/items/${itemId}/apply`, { method: "POST" });
    return normalize<{ ok: boolean; applied: boolean; item?: StoreItem; userPatch?: Partial<User>; effect?: string }>(raw);
  },

  async unapplyStoreItem(itemId: string): Promise<{ ok: boolean; applied: boolean; userPatch?: Partial<User> }> {
    const raw = await request<unknown>(`/store/items/${itemId}/unapply`, { method: "POST" });
    return normalize<{ ok: boolean; applied: boolean; userPatch?: Partial<User> }>(raw);
  },

  async upgradeNft(itemId: string): Promise<{ ok: boolean; balance: number; level: number; serialNumber?: number | null; nftMetadata?: StoreItem["nftMetadata"]; upgradedAt?: string | null; cost?: number; item?: StoreItem }> {
    const raw = await request<unknown>(`/store/items/${itemId}/upgrade`, { method: "POST" });
    return normalize<{ ok: boolean; balance: number; level: number; serialNumber?: number | null; nftMetadata?: StoreItem["nftMetadata"]; upgradedAt?: string | null; cost?: number; item?: StoreItem }>(raw);
  },

  async getCoinTransactions(): Promise<{ id: string; delta: number; reason: string; referenceId?: string | null; createdAt: string }[]> {
    const raw = await request<unknown[]>("/store/transactions");
    return normalize<{ id: string; delta: number; reason: string; referenceId?: string | null; createdAt: string }[]>(raw);
  },

  async createCheckoutSession(itemId: string): Promise<{ url: string }> {
    return request(`/store/items/${itemId}/checkout`, { method: "POST" });
  },

  // ---- Profile ------------------------------------------------------------

  async getUserProfile(username: string): Promise<User> {
    const raw = await request<unknown>(`/users/${username}`);
    return normalizeUser(raw);
  },

  async getUserPosts(username: string): Promise<Post[]> {
    const raw = await request<unknown[]>(`/users/${username}/posts`);
    return normalize<Post[]>(raw);
  },

  async getUserComments(username: string): Promise<Comment[]> {
    const raw = await request<unknown[]>(`/users/${username}/comments`);
    return normalize<Comment[]>(raw);
  },

  async getUserGifts(username: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/users/${username}/gifts`);
    return normalize<unknown[]>(raw);
  },

  async getProfileWall(username: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/users/${username}/wall`);
    return normalize<unknown[]>(raw);
  },

  async addProfileWall(username: string, payload: { text?: string; media?: { type: "image" | "video"; url: string }[] }): Promise<unknown> {
    const raw = await request<unknown>(`/users/${username}/wall`, { method: "POST", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },

  async toggleWallLike(postId: string): Promise<{ liked: boolean; likesCount: number }> {
    const raw = await request<unknown>(`/users/wall/${postId}/like`, { method: "POST" });
    return normalize<{ liked: boolean; likesCount: number }>(raw);
  },

  async toggleWallPin(postId: string): Promise<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }> {
    const raw = await request<unknown>(`/users/wall/${postId}/pin`, { method: "POST" });
    return normalize<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }>(raw);
  },

  async deleteWallPost(postId: string): Promise<{ ok: boolean }> {
    return request(`/users/wall/${postId}`, { method: "DELETE" });
  },

  async getWallComments(postId: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/users/wall/${postId}/comments`);
    return normalize<unknown[]>(raw);
  },

  async addWallComment(postId: string, text: string, parentId?: string | null): Promise<unknown> {
    const raw = await request<unknown>(`/users/wall/${postId}/comments`, { method: "POST", body: JSON.stringify({ text, parentId }) });
    return normalize<unknown>(raw);
  },

  async toggleWallCommentLike(commentId: string): Promise<{ liked: boolean; likesCount: number }> {
    const raw = await request<unknown>(`/users/wall/comments/${commentId}/like`, { method: "POST" });
    return normalize<{ liked: boolean; likesCount: number }>(raw);
  },

  async toggleWallCommentPin(commentId: string): Promise<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }> {
    const raw = await request<unknown>(`/users/wall/comments/${commentId}/pin`, { method: "POST" });
    return normalize<{ ok: boolean; pinned: boolean; pinnedAt?: string | null }>(raw);
  },

  async deleteWallComment(commentId: string): Promise<{ ok: boolean }> {
    return request(`/users/wall/comments/${commentId}`, { method: "DELETE" });
  },

  async getUserFollowers(username: string): Promise<{ hidden?: boolean; users: unknown[] }> {
    const raw = await request<unknown>(`/users/${username}/followers`);
    return normalize<{ hidden?: boolean; users: unknown[] }>(raw);
  },

  async getUserFollowing(username: string): Promise<{ hidden?: boolean; users: unknown[] }> {
    const raw = await request<unknown>(`/users/${username}/following`);
    return normalize<{ hidden?: boolean; users: unknown[] }>(raw);
  },

  async updateProfile(payload: Partial<Pick<User, "displayName" | "bio" | "nameColor" | "nameColorId" | "avatarUrl" | "bannerUrl" | "glowEffect" | "avatarFrame" | "customId" | "notificationSettings" | "hideSocial" | "hidePurchases" | "privacyProfile" | "privacyMessages" | "privacyGroups" | "privacyLastSeen" | "hideReadReceipts" | "filterUnknownMessages" | "nightStatusText" | "nightStatusEmoji" | "nightStatusExpiresAt" | "musicArtist" | "musicTrack" | "roomScene">>): Promise<User> {
    const raw = await request<unknown>("/users/me", { method: "PATCH", body: JSON.stringify(payload) });
    return normalizeUser(raw);
  },

  // ---- Notifications ------------------------------------------------------

  async getNotifications(): Promise<AppNotification[]> {
    const raw = await request<unknown[]>("/notifications");
    return (raw || []).map(normalizeNotification);
  },

  async markAllNotificationsRead(): Promise<{ ok: boolean }> {
    return request("/notifications/read-all", { method: "POST" });
  },

  async markNotificationRead(id: string): Promise<{ ok: boolean }> {
    return request(`/notifications/${id}/read`, { method: "POST" });
  },

  async getPushConfig(): Promise<{ enabled: boolean; publicKey: string | null }> {
    return request("/notifications/push-config");
  },

  async savePushSubscription(payload: { endpoint: string; keys: { p256dh: string; auth: string }; platform: string; timezoneOffsetMinutes: number }): Promise<{ ok: boolean; enabled: boolean }> {
    return request("/notifications/push-subscriptions", { method: "POST", body: JSON.stringify(payload) });
  },

  async removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
    return request("/notifications/push-subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) });
  },

  async testWebPush(): Promise<{ ok: boolean; configured: boolean; sent: number; failed: number; web?: unknown; native?: unknown }> {
    return request("/notifications/push-test", { method: "POST" });
  },

  async getNativePushConfig(): Promise<{ enabled: boolean; android: boolean; ios: boolean; voip: boolean }> {
    return request("/notifications/native-config");
  },

  async saveNativePushToken(payload: { token: string; platform: "android" | "ios"; deviceId: string; appVersion: string; timezoneOffsetMinutes: number; voip?: boolean }): Promise<{ ok: boolean; enabled: boolean }> {
    return request("/notifications/native-tokens", { method: "POST", body: JSON.stringify(payload) });
  },

  async removeNativePushToken(payload: { token?: string; deviceId?: string }): Promise<{ ok: boolean }> {
    return request("/notifications/native-tokens", { method: "DELETE", body: JSON.stringify(payload) });
  },

  // ---- Admin / Purchases --------------------------------------------------

  async createPurchaseRequest(payload: {
    itemType: "premium" | "coins";
    itemName: string;
    price: number;
    giftRecipientId?: string;
  }): Promise<{ id: string; paymentCode?: string; paymentComment?: string; giftRecipientUsername?: string; giftRecipientNgId?: number }> {
    const raw = await request<unknown>("/admin/purchases", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalize<{ id: string; paymentCode?: string; paymentComment?: string; giftRecipientUsername?: string; giftRecipientNgId?: number }>(raw);
  },

  async getPurchaseRequests(status?: string): Promise<unknown[]> {
    const qs = status ? `?status=${status}` : "";
    const raw = await request<unknown[]>(`/admin/purchases${qs}`);
    return normalize<unknown[]>(raw);
  },

  async getPaymentEvents(status?: string): Promise<unknown[]> {
    const qs = status ? `?status=${status}` : "";
    const raw = await request<unknown[]>(`/admin/payments/events${qs}`);
    return normalize<unknown[]>(raw);
  },

  async approvePurchase(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/purchases/${id}/approve`, { method: "POST" });
  },

  async rejectPurchase(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/purchases/${id}/reject`, { method: "POST" });
  },

  // ---- Channels ------------------------------------------------------------
  async getChannels(): Promise<(unknown & { subscribed?: boolean })[]> {
    const raw = await request<unknown[]>("/channels");
    return normalize<(unknown & { subscribed?: boolean })[]>(raw);
  },
  async toggleChannelSubscription(channelId: string): Promise<{ ok: boolean; subscribed: boolean }> {
    return request(`/channels/${channelId}/subscribe`, { method: "POST" });
  },
  async getChannel(handle: string): Promise<unknown> {
    const raw = await request<unknown>(`/channels/by-handle/${encodeURIComponent(handle)}`);
    return normalize<unknown>(raw);
  },
  async createChannel(payload: { name: string; handle: string; description?: string; avatarUrl?: string | null; bannerUrl?: string | null; tags?: string[] }): Promise<unknown> {
    const raw = await request<unknown>("/channels", { method: "POST", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },
  async getChannelPosts(channelId: string): Promise<Post[]> {
    const raw = await request<unknown[]>(`/channels/${channelId}/posts`);
    return normalize<Post[]>(raw);
  },
  async getChannelAnalytics(channelId: string): Promise<unknown> {
    const raw = await request<unknown>(`/channels/${channelId}/analytics`);
    return normalize<unknown>(raw);
  },
  async getChannelDrafts(channelId: string): Promise<Post[]> {
    const raw = await request<unknown[]>(`/channels/${channelId}/drafts`);
    return normalize<Post[]>(raw);
  },
  async publishChannelDraft(channelId: string, postId: string): Promise<Post> {
    const raw = await request<unknown>(`/channels/${channelId}/drafts/${postId}/publish`, { method: "POST" });
    return normalize<Post>(raw);
  },
  async deleteChannelDraft(channelId: string, postId: string): Promise<{ ok: boolean }> {
    return request(`/channels/${channelId}/drafts/${postId}`, { method: "DELETE" });
  },
  async getChannelRoles(channelId: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/channels/${channelId}/roles`);
    return normalize<unknown[]>(raw);
  },
  async setChannelRole(channelId: string, userId: string, role: string): Promise<{ ok: boolean; role: string }> {
    return request(`/channels/${channelId}/roles`, { method: "POST", body: JSON.stringify({ userId, role }) });
  },
  async removeChannelRole(channelId: string, userId: string): Promise<{ ok: boolean }> {
    return request(`/channels/${channelId}/roles/${userId}`, { method: "DELETE" });
  },
  async transferChannelOwner(channelId: string, newOwnerId: string, password: string): Promise<{ ok: boolean; ownerId: string }> {
    return request(`/channels/${channelId}/transfer-owner`, { method: "POST", body: JSON.stringify({ newOwnerId, password }) });
  },
  async updateChannel(channelId: string, payload: Partial<{ name: string; handle: string; description: string; avatarUrl: string | null; bannerUrl: string | null; tags: string[]; boostColor: string | null; boostGlow: string | null; boostAvatarFrame: string | null; hideSubscribers: boolean; isPrivate: boolean; chatEnabled: boolean; commentsEnabled: boolean; commentSlowModeSeconds: number }>): Promise<unknown> {
    const raw = await request<unknown>(`/channels/${channelId}`, { method: "PATCH", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },
  async deleteChannel(channelId: string, password: string): Promise<{ ok: boolean }> {
    return request(`/channels/${channelId}`, { method: "DELETE", body: JSON.stringify({ password }) });
  },
  async joinChannelChat(channelId: string): Promise<{ ok: boolean; conversationId: string; conversation?: Conversation }> {
    return request(`/channels/${channelId}/chat`, { method: "POST" });
  },

  async getChannelSubscribers(channelId: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/channels/${channelId}/subscribers`);
    return normalize<unknown[]>(raw);
  },
  async getChannelBans(channelId: string): Promise<unknown[]> {
    return normalize<unknown[]>(await request<unknown[]>(`/channels/${channelId}/bans`));
  },
  async banChannelSubscriber(channelId: string, payload: { userId: string; reason?: string; expiresAt?: string | null }): Promise<{ ok: boolean }> {
    return request(`/channels/${channelId}/bans`, { method: "POST", body: JSON.stringify(payload) });
  },
  async unbanChannelSubscriber(channelId: string, userId: string): Promise<{ ok: boolean }> {
    return request(`/channels/${channelId}/bans/${userId}`, { method: "DELETE" });
  },
  async getChannelModerationLog(channelId: string): Promise<unknown[]> {
    return normalize<unknown[]>(await request<unknown[]>(`/channels/${channelId}/moderation-log`));
  },
  async boostChannel(channelId: string, payload: { kind: string; value?: string }): Promise<{ ok: boolean; boostBalance?: number; activeBoosts?: number; boostMeta?: unknown }> {
    return request(`/channels/${channelId}/boost`, { method: "POST", body: JSON.stringify(payload) });
  },
  async getMyChannelBoosts(): Promise<unknown[]> {
    const raw = await request<unknown[]>("/channels/my-boosts");
    return normalize<unknown[]>(raw);
  },
  async removeChannelBoost(boostId: string): Promise<{ ok: boolean; boostBalance?: number }> {
    return request(`/channels/boosts/${boostId}`, { method: "DELETE" });
  },

  // ---- Social graph --------------------------------------------------------
  async getSocial(): Promise<{ friends: unknown[]; following: unknown[]; favorites: unknown[]; blocked: unknown[]; groups: unknown[]; channels: unknown[]; hidden?: boolean }> {
    const raw = await request<unknown>("/social");
    return normalize<{ friends: unknown[]; following: unknown[]; favorites: unknown[]; blocked: unknown[]; groups: unknown[]; channels: unknown[]; hidden?: boolean }>(raw);
  },
  async getUserSocial(username: string): Promise<{ friends: unknown[]; channels: unknown[]; hidden?: boolean }> {
    const raw = await request<unknown>(`/social/${username}`);
    return normalize<{ friends: unknown[]; channels: unknown[]; hidden?: boolean }>(raw);
  },
  async socialAction(action: "friend" | "favorite" | "block", userId: string): Promise<{ ok: boolean; active: boolean; friends?: boolean }> {
    return request(`/social/${action}`, { method: "POST", body: JSON.stringify({ userId }) });
  },
  async getCircles(): Promise<unknown[]> {
    const raw = await request<unknown[]>("/social/circles");
    return normalize<unknown[]>(raw);
  },
  async createCircle(payload: { name: string; color: string }): Promise<unknown> {
    const raw = await request<unknown>("/social/circles", { method: "POST", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },
  async deleteCircle(id: string): Promise<{ ok: boolean }> {
    return request(`/social/circles/${id}`, { method: "DELETE" });
  },
  async addCircleMember(circleId: string, userId: string): Promise<{ ok: boolean }> {
    return request(`/social/circles/${circleId}/members`, { method: "POST", body: JSON.stringify({ userId }) });
  },
  async removeCircleMember(circleId: string, userId: string): Promise<{ ok: boolean }> {
    return request(`/social/circles/${circleId}/members/${userId}`, { method: "DELETE" });
  },

  // ---- Support Tickets ----
  async getMyTickets(): Promise<unknown[]> {
    const raw = await request<unknown[]>("/support/tickets");
    return normalize<unknown[]>(raw);
  },

  // ---- Admin: Tickets ----
  async getTickets(status?: string): Promise<unknown[]> {
    const qs = status ? `?status=${status}` : "";
    const raw = await request<unknown[]>(`/admin/tickets${qs}`);
    return normalize<unknown[]>(raw);
  },
  async updateTicket(id: string, payload: { status?: string; assignedTo?: string; priority?: string }): Promise<unknown> {
    return request(`/admin/tickets/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
  async createTicket(payload: { subject: string; body: string; category: string }): Promise<unknown> {
    return request("/support/tickets", { method: "POST", body: JSON.stringify(payload) });
  },
  async getTicketMessages(ticketId: string, admin = false): Promise<unknown[]> {
    const raw = await request<unknown[]>(`${admin ? "/admin" : "/support"}/tickets/${ticketId}/messages`);
    return normalize<unknown[]>(raw);
  },
  async replyTicket(ticketId: string, text: string, admin = false): Promise<unknown> {
    const raw = await request<unknown>(`${admin ? "/admin" : "/support"}/tickets/${ticketId}/messages`, { method: "POST", body: JSON.stringify({ text }) });
    return normalize<unknown>(raw);
  },

  // ---- Admin: Users ----
  async getAdminUsers(search?: string, limit?: number): Promise<unknown[]> {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (limit) qs.set("limit", String(limit));
    const raw = await request<unknown[]>(`/admin/users${qs.toString() ? "?" + qs.toString() : ""}`);
    return normalize<unknown[]>(raw);
  },
  async getAdminUserDetail(userId: string): Promise<unknown> {
    const raw = await request<unknown>(`/admin/users/${userId}/detail`);
    return normalize<unknown>(raw);
  },
  async updateAdminUserProfile(userId: string, payload: Record<string, unknown>): Promise<unknown> {
    const raw = await request<unknown>(`/admin/users/${userId}/profile`, { method: "PATCH", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },
  async resetAdminUserCosmetics(userId: string): Promise<unknown> {
    const raw = await request<unknown>(`/admin/users/${userId}/reset-cosmetics`, { method: "POST" });
    return normalize<unknown>(raw);
  },
  async regrantPurchase(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/purchases/${id}/regrant`, { method: "POST" });
  },
  async changeRole(userId: string, role: string): Promise<{ ok: boolean }> {
    return request(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
  },
  async verifyUser(userId: string, verified: boolean): Promise<{ ok: boolean }> {
    return request(`/admin/users/${userId}/verify`, { method: "PATCH", body: JSON.stringify({ verified }) });
  },
  async editUserStats(userId: string, payload: { nightCoins?: number; boostBalance?: number; isPremium?: boolean; premiumUntil?: string | null }): Promise<{ ok: boolean }> {
    return request(`/admin/users/${userId}/stats`, { method: "PATCH", body: JSON.stringify(payload) });
  },

  // ---- Admin: Punishments ----
  async getPunishments(): Promise<unknown[]> {
    const raw = await request<unknown[]>("/admin/punishments");
    return normalize<unknown[]>(raw);
  },
  async createPunishment(payload: { userId: string; type: string; reason: string; duration: string }): Promise<unknown> {
    return request("/admin/punishments", { method: "POST", body: JSON.stringify(payload) });
  },
  async revokePunishment(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/punishments/${id}/revoke`, { method: "POST" });
  },

  // ---- Admin: Reports ----
  async createReport(payload: { targetType: string; targetId: string; category: string; reason: string }): Promise<unknown> {
    return request("/admin/reports", { method: "POST", body: JSON.stringify(payload) });
  },
  async getReports(status?: string): Promise<unknown[]> {
    const qs = status ? `?status=${status}` : "";
    const raw = await request<unknown[]>(`/admin/reports${qs}`);
    return normalize<unknown[]>(raw);
  },
  async actionReport(id: string, action: string, payload: { note?: string; punishment?: { type: string; duration: string; reason: string; userId?: string } } = {}): Promise<{ ok: boolean }> {
    return request(`/admin/reports/${id}/action`, { method: "POST", body: JSON.stringify({ action, ...payload }) });
  },
  async getReportNotes(id: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/admin/reports/${id}/notes`);
    return normalize<unknown[]>(raw);
  },
  async addReportNote(id: string, body: string): Promise<unknown> {
    const raw = await request<unknown>(`/admin/reports/${id}/notes`, { method: "POST", body: JSON.stringify({ body }) });
    return normalize<unknown>(raw);
  },
  async updateReportTarget(id: string, payload: Record<string, unknown>): Promise<unknown> {
    const raw = await request<unknown>(`/admin/reports/${id}/target`, { method: "PATCH", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },

  // ---- Admin: Broadcast ----
  async sendBroadcast(payload: { title: string; subtitle?: string; body?: string; icon?: string }): Promise<{ ok: boolean; sent: number }> {
    return request("/admin/broadcast", { method: "POST", body: JSON.stringify(payload) });
  },

  // ---- Admin: Logs ----
  async getLogs(): Promise<unknown[]> {
    const raw = await request<unknown[]>("/admin/logs");
    return normalize<unknown[]>(raw);
  },
  async getSafetyEvents(): Promise<unknown[]> {
    const raw = await request<unknown[]>("/admin/safety/events");
    return normalize<unknown[]>(raw);
  },
  async getSafetyFlags(status = "open"): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/admin/safety/flags?status=${encodeURIComponent(status)}`);
    return normalize<unknown[]>(raw);
  },
  async resolveSafetyFlag(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/safety/flags/${id}/resolve`, { method: "POST" });
  },
  async getSafetyUsers(mode: "all" | "trusted" | "restricted" = "all"): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/admin/safety/users?mode=${encodeURIComponent(mode)}`);
    return normalize<unknown[]>(raw);
  },
  async getSafetyUser(id: string): Promise<unknown> {
    const raw = await request<unknown>(`/admin/safety/users/${id}`);
    return normalize<unknown>(raw);
  },
  async setSafetyRestrictions(id: string, payload: { restrictions: Record<string, boolean>; restrictedUntil?: string | null; trustOverride?: "trusted" | "restricted" | null }): Promise<unknown> {
    const raw = await request<unknown>(`/admin/safety/users/${id}/restrictions`, { method: "PATCH", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },
  async getSafetyDomains(): Promise<unknown[]> {
    const raw = await request<unknown[]>("/admin/safety/domains");
    return normalize<unknown[]>(raw);
  },
  async addSafetyDomain(payload: { domain: string; action: "allow" | "deny"; reason?: string }): Promise<unknown> {
    const raw = await request<unknown>("/admin/safety/domains", { method: "POST", body: JSON.stringify(payload) });
    return normalize<unknown>(raw);
  },
  async deleteSafetyDomain(domain: string): Promise<{ ok: boolean }> {
    return request(`/admin/safety/domains/${encodeURIComponent(domain)}`, { method: "DELETE" });
  },
};

function normalizeSession(data: {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}): AuthSession {
  if (typeof window !== "undefined") {
    persistAuthTokens(data.accessToken, data.refreshToken);
  }
  let expiresAt = Date.now() + 15 * 60 * 1000;
  try {
    const payload = decodeJwtPayload(data.accessToken);
    if (typeof payload.exp === "number") expiresAt = payload.exp * 1000;
  } catch {
    /* ignore */
  }
  const user = normalizeUser(data.user);
  if (isBrowser()) localStorage.setItem("ng_cached_user", JSON.stringify(user));
  return {
    user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt,
  };
}
