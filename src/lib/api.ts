// =============================================================================
//  NightGram Web — Backend API client (Node.js + Express)
//  Talks to the shared backend that also powers the mobile app.
//  Includes snake_case → camelCase normalization for all responses.
// =============================================================================

import type {
  AppNotification,
  AuthSession,
  Comment,
  Conversation,
  Message,
  Post,
  StoreItem,
  User,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const PROXY_API_URL = "/api/backend";

function shouldPreferProxy(): boolean {
  if (!isBrowser()) return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

function primaryApiBase(): string {
  return shouldPreferProxy() ? PROXY_API_URL : API_URL;
}

function fallbackApiBase(): string {
  return shouldPreferProxy() ? API_URL : PROXY_API_URL;
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

  return {
    id: String(m.id ?? ""),
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
    replyTo,
    reactions,
    status: (m.status as Message["status"]) ?? "sent",
    deliveredTo: Array.isArray(m.deliveredTo) ? m.deliveredTo.map(String) : [],
    readBy: Array.isArray(m.readBy) ? m.readBy.map(String) : [],
    createdAt: String(m.createdAt ?? new Date().toISOString()),
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
    participants,
    lastMessage: c.lastMessage ? normalizeMessage(c.lastMessage) : null,
    unreadCount: Number(c.unreadCount ?? 0),
    pinned: Boolean(c.pinned ?? false),
    muted: Boolean(c.muted ?? false),
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
    notificationSettings: (u.notificationSettings as User["notificationSettings"]) ?? {
      push: true, messages: true, likes: true, comments: true,
      newFollowers: true, storeDrops: true, sounds: true,
    },
    hideSocial: Boolean(u.hideSocial ?? false),
    hidePurchases: Boolean(u.hidePurchases ?? false),
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

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const timeoutMs = 18000;
  const runPrimary = () => fetchWithTimeout(`${primaryApiBase()}${path}`, { ...options, headers }, shouldPreferProxy() ? 30000 : timeoutMs);
  const runFallback = () => fetchWithTimeout(`${fallbackApiBase()}${path}`, { ...options, headers }, shouldPreferProxy() ? timeoutMs : 30000);

  let res: Response;
  try {
    res = await runPrimary();
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error;
    await wakeBackend().catch(() => {});
    try {
      res = await runFallback();
    } catch (fallbackError) {
      if (isTransientNetworkError(fallbackError)) {
        throw new Error("Не удалось подключиться к серверу. Backend недоступен или Vercel proxy не смог с ним связаться.");
      }
      throw fallbackError;
    }
  }

  // Try a single silent token refresh on expiry.
  if (res.status === 401 && typeof window !== "undefined") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = getStoredAccessToken();
      if (newToken) headers["Authorization"] = `Bearer ${newToken}`;
      res = await runPrimary().catch(() => runFallback());
    }
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    if (res.status === 429) {
      try {
        const parsed = JSON.parse(msg) as { message?: string; retryAfter?: number; error?: string };
        const retry = parsed.retryAfter ? ` Подожди ${parsed.retryAfter} сек.` : "";
        throw new Error(parsed.message ? `${parsed.message}${retry}` : `Слишком много действий.${retry}`);
      } catch (error) {
        if (error instanceof Error && !error.message.startsWith("Unexpected")) throw error;
      }
    }
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

async function wakeBackend(): Promise<void> {
  const base = API_URL.replace(/\/api\/?$/, "");
  const healthUrl = `${API_URL}/health`;
  const rootUrl = base || API_URL;
  try {
    const res = await fetchWithTimeout(healthUrl, { method: "GET", cache: "no-store" }, 12000);
    if (res.ok) return;
  } catch {
    // Try root health next; many Railway services respond on /.
  }
  await fetchWithTimeout(rootUrl, { method: "GET", cache: "no-store" }, 20000).catch(() => {});
}

async function tryRefresh(): Promise<boolean> {
  const refresh = getStoredRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetchWithTimeout(`${primaryApiBase()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    }, shouldPreferProxy() ? 30000 : 18000).catch(() => fetchWithTimeout(`${fallbackApiBase()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    }, shouldPreferProxy() ? 18000 : 30000));
    if (!res.ok) return false;
    const data = await res.json();
    persistAuthTokens(data.accessToken, data.refreshToken);
    if (isBrowser()) window.dispatchEvent(new Event("nightgram:auth-token-refresh"));
    return true;
  } catch {
    return false;
  }
}

// ---- API methods -----------------------------------------------------------

export const api = {
  async wake(): Promise<void> {
    await wakeBackend();
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
  }): Promise<AuthSession> {
    const data = await request<{ accessToken: string; refreshToken: string; user: unknown }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(payload) },
    );
    return normalizeSession(data);
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

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return request("/auth/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) });
  },

  async requestAccountDeletion(password: string): Promise<User> {
    const raw = await request<unknown>("/auth/delete-request", { method: "POST", body: JSON.stringify({ password }) });
    return normalizeUser(raw);
  },

  async cancelAccountDeletion(password: string): Promise<User> {
    const raw = await request<unknown>("/auth/delete-cancel", { method: "POST", body: JSON.stringify({ password }) });
    return normalizeUser(raw);
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
    const raw = await request<unknown[]>("/stories");
    return normalize<unknown[]>(raw);
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

  async getFeed(cursor?: string, limit = 6): Promise<{ posts: Post[]; nextCursor: string | null }> {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set("cursor", cursor);
    const raw = await request<unknown>(`/feed?${qs.toString()}`);
    return normalize<{ posts: Post[]; nextCursor: string | null }>(raw);
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
    media?: { type: "image" | "video"; url: string; thumbnailUrl?: string }[];
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

  async searchUsers(q: string): Promise<unknown[]> {
    const raw = await request<unknown[]>(`/users/search?q=${encodeURIComponent(q)}`);
    return normalize<unknown[]>(raw);
  },

  async createGroupConversation(payload: { title: string; description?: string; avatarUrl?: string | null; userIds: string[] }): Promise<Conversation> {
    const raw = await request<unknown>("/conversations/groups", { method: "POST", body: JSON.stringify(payload) });
    return normalize<Conversation>(raw);
  },

  async createDirectConversation(userId: string): Promise<{ id: string } & Partial<Conversation>> {
    const raw = await request<unknown>("/conversations/direct", { method: "POST", body: JSON.stringify({ userId }) });
    return normalize<{ id: string } & Partial<Conversation>>(raw);
  },

  async toggleConversationPin(conversationId: string): Promise<{ ok: boolean; pinned: boolean }> {
    return request(`/conversations/${conversationId}/pin`, { method: "POST" });
  },

  async toggleConversationMute(conversationId: string): Promise<{ ok: boolean; muted: boolean }> {
    return request(`/conversations/${conversationId}/mute`, { method: "POST" });
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

  async updateProfile(payload: Partial<Pick<User, "displayName" | "bio" | "nameColor" | "nameColorId" | "avatarUrl" | "bannerUrl" | "glowEffect" | "avatarFrame" | "customId" | "notificationSettings" | "hideSocial" | "hidePurchases" | "nightStatusText" | "nightStatusEmoji" | "nightStatusExpiresAt" | "musicArtist" | "musicTrack" | "roomScene">>): Promise<User> {
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
  async updateChannel(channelId: string, payload: Partial<{ name: string; handle: string; description: string; avatarUrl: string | null; bannerUrl: string | null; tags: string[]; boostColor: string | null; boostGlow: string | null; boostAvatarFrame: string | null; hideSubscribers: boolean; isPrivate: boolean; chatEnabled: boolean }>): Promise<unknown> {
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
