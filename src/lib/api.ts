// =============================================================================
//  NightGram Web — Backend API client (Node.js + Express)
//  Talks to the shared backend that also powers the mobile app.
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

/** Thin fetch wrapper that injects JWT + refreshes on 401. */
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

// ---- Auth -----------------------------------------------------------------

export const api = {
  async register(payload: {
    username: string;
    email: string;
    password: string;
  }): Promise<AuthSession> {
    const data = await request<{ accessToken: string; refreshToken: string; user: User }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(payload) },
    );
    return normalizeSession(data);
  },

  async login(payload: {
    email: string;
    password: string;
  }): Promise<AuthSession> {
    const data = await request<{ accessToken: string; refreshToken: string; user: User }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(payload) },
    );
    return normalizeSession(data);
  },

  async me(): Promise<User> {
    return request<User>("/auth/me");
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
    return request(`/feed?${qs.toString()}`);
  },

  async toggleLike(postId: string): Promise<{ liked: boolean; likesCount: number }> {
    return request(`/posts/${postId}/like`, { method: "POST" });
  },

  async toggleSave(postId: string): Promise<{ saved: boolean }> {
    return request(`/posts/${postId}/save`, { method: "POST" });
  },

  async getComments(postId: string): Promise<Comment[]> {
    return request(`/posts/${postId}/comments`);
  },

  async addComment(postId: string, text: string): Promise<Comment> {
    return request(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  async viewPost(postId: string): Promise<void> {
    await request(`/posts/${postId}/view`, { method: "POST" }).catch(() => {});
  },

  // ---- Messenger ----------------------------------------------------------

  async getConversations(): Promise<Conversation[]> {
    return request("/conversations");
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    return request(`/conversations/${conversationId}/messages`);
  },

  // ---- Night Store --------------------------------------------------------

  async getStoreItems(): Promise<StoreItem[]> {
    return request("/store/items");
  },

  async buyWithCoins(itemId: string): Promise<{ balance: number; owned: boolean }> {
    return request(`/store/items/${itemId}/buy`, { method: "POST" });
  },

  async createCheckoutSession(itemId: string): Promise<{ url: string }> {
    return request(`/store/items/${itemId}/checkout`, { method: "POST" });
  },

  async createPremiumCheckout(plan: "monthly" | "yearly"): Promise<{ url: string }> {
    return request("/premium/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
  },

  // ---- Profile ------------------------------------------------------------

  async getUserProfile(username: string): Promise<User> {
    return request(`/users/${username}`);
  },

  async getUserPosts(username: string): Promise<Post[]> {
    return request(`/users/${username}/posts`);
  },

  async updateProfile(payload: Partial<Pick<User, "displayName" | "bio" | "nameColor" | "avatarUrl" | "bannerUrl" | "glowEffect" | "avatarFrame" | "customId" | "notificationSettings">>): Promise<User> {
    return request("/users/me", { method: "PATCH", body: JSON.stringify(payload) });
  },
};

function normalizeSession(data: {
  accessToken: string;
  refreshToken: string;
  user: User;
}): AuthSession {
  if (typeof window !== "undefined") {
    localStorage.setItem("ng_access_token", data.accessToken);
    localStorage.setItem("ng_refresh_token", data.refreshToken);
  }
  // Decode exp from JWT (base64 payload) without verifying signature client-side.
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
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt,
  };
}
