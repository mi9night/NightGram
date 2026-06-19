// =============================================================================
//  NightGram Web — Backend API client (Node.js + Express)
//  Talks to the shared backend that also powers the mobile app.
//  Includes snake_case → camelCase normalization for all responses.
// =============================================================================

import type {
  AuthSession,
  Comment,
  Conversation,
  Message,
  Post,
  StoreItem,
  User,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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
    glowEffect: (u.glowEffect as string) ?? null,
    avatarFrame: (u.avatarFrame as string) ?? null,
    nightCoins: Number(u.nightCoins ?? 0),
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
  };
}

// ---- fetch wrapper ---------------------------------------------------------

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("ng_access_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // Try a single silent token refresh on expiry.
  if (res.status === 401 && typeof window !== "undefined") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = localStorage.getItem("ng_access_token");
      if (newToken) headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem("ng_refresh_token");
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("ng_access_token", data.accessToken);
    localStorage.setItem("ng_refresh_token", data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ---- API methods -----------------------------------------------------------

export const api = {
  async register(payload: {
    username: string;
    email: string;
    password: string;
  }): Promise<AuthSession> {
    const data = await request<{ accessToken: string; refreshToken: string; user: unknown }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(payload) },
    );
    return normalizeSession(data);
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

  async logout(): Promise<void> {
    const refresh = localStorage.getItem("ng_refresh_token");
    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: refresh }),
    }).catch(() => {});
    localStorage.removeItem("ng_access_token");
    localStorage.removeItem("ng_refresh_token");
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

  async addComment(postId: string, text: string): Promise<Comment> {
    const raw = await request<unknown>(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    return normalize<Comment>(raw);
  },

  async viewPost(postId: string): Promise<void> {
    await request(`/posts/${postId}/view`, { method: "POST" }).catch(() => {});
  },

  async createPost(payload: {
    text?: string;
    media?: { type: "image" | "video"; url: string; thumbnailUrl?: string }[];
    tags?: string[];
  }): Promise<Post> {
    const raw = await request<unknown>(`/posts`, { method: "POST", body: JSON.stringify(payload) });
    return normalize<Post>(raw);
  },

  // ---- Messenger ----------------------------------------------------------

  async getConversations(): Promise<Conversation[]> {
    const raw = await request<unknown>("/conversations");
    return normalize<Conversation[]>(raw);
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const raw = await request<unknown[]>(`/conversations/${conversationId}/messages`);
    return normalize<Message[]>(raw);
  },

  // ---- Night Store --------------------------------------------------------

  async getStoreItems(): Promise<StoreItem[]> {
    const raw = await request<unknown[]>("/store/items");
    return normalize<StoreItem[]>(raw);
  },

  async buyWithCoins(itemId: string): Promise<{ balance: number; owned: boolean }> {
    const raw = await request<unknown>(`/store/items/${itemId}/buy`, { method: "POST" });
    return normalize<{ balance: number; owned: boolean }>(raw);
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

  async updateProfile(payload: Partial<Pick<User, "displayName" | "bio" | "nameColor" | "nameColorId" | "avatarUrl" | "bannerUrl" | "glowEffect" | "avatarFrame" | "customId" | "notificationSettings">>): Promise<User> {
    const raw = await request<unknown>("/users/me", { method: "PATCH", body: JSON.stringify(payload) });
    return normalizeUser(raw);
  },

  // ---- Admin / Purchases --------------------------------------------------

  async createPurchaseRequest(payload: {
    itemType: "premium" | "coins";
    itemName: string;
    price: number;
  }): Promise<{ id: string }> {
    const raw = await request<unknown>("/admin/purchases", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalize<{ id: string }>(raw);
  },

  async getPurchaseRequests(status?: string): Promise<unknown[]> {
    const qs = status ? `?status=${status}` : "";
    const raw = await request<unknown[]>(`/admin/purchases${qs}`);
    return normalize<unknown[]>(raw);
  },

  async approvePurchase(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/purchases/${id}/approve`, { method: "POST" });
  },

  async rejectPurchase(id: string): Promise<{ ok: boolean }> {
    return request(`/admin/purchases/${id}/reject`, { method: "POST" });
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
    return request("/admin/tickets", { method: "POST", body: JSON.stringify(payload) });
  },

  // ---- Admin: Users ----
  async getAdminUsers(search?: string, limit?: number): Promise<unknown[]> {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (limit) qs.set("limit", String(limit));
    const raw = await request<unknown[]>(`/admin/users${qs.toString() ? "?" + qs.toString() : ""}`);
    return normalize<unknown[]>(raw);
  },
  async changeRole(userId: string, role: string): Promise<{ ok: boolean }> {
    return request(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
  },
  async verifyUser(userId: string, verified: boolean): Promise<{ ok: boolean }> {
    return request(`/admin/users/${userId}/verify`, { method: "PATCH", body: JSON.stringify({ verified }) });
  },
  async editUserStats(userId: string, payload: { nightCoins?: number; isPremium?: boolean; premiumUntil?: string }): Promise<{ ok: boolean }> {
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
  async actionReport(id: string, action: string): Promise<{ ok: boolean }> {
    return request(`/admin/reports/${id}/action`, { method: "POST", body: JSON.stringify({ action }) });
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
};

function normalizeSession(data: {
  accessToken: string;
  refreshToken: string;
  user: unknown;
}): AuthSession {
  if (typeof window !== "undefined") {
    localStorage.setItem("ng_access_token", data.accessToken);
    localStorage.setItem("ng_refresh_token", data.refreshToken);
  }
  let expiresAt = Date.now() + 15 * 60 * 1000;
  try {
    const payload = JSON.parse(
      atob(data.accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.exp) expiresAt = payload.exp * 1000;
  } catch {
    /* ignore */
  }
  return {
    user: normalizeUser(data.user),
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt,
  };
}
