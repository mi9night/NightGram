"use client";

// =============================================================================
//  NightGram Web — Auth context
//  Real backend authentication only — no demo mode.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthSession, TwoFactorLoginChallenge, User } from "@/types";
import { api, clearStoredAuth, getStoredAccessToken, getStoredRefreshToken, persistAuthTokens } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  /** Backward-compatible flag for old UI components. Demo mode was removed. */
  isDemo: boolean;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<TwoFactorLoginChallenge | null>;
  verifyTwoFactorLogin: (challengeToken: string, code: string) => Promise<void>;
  register: (username: string, email: string, password: string, options?: { login?: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  switchAccount: (session: AuthSession) => void;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Old demo tokens that should be cleared on next visit.
const DEMO_TOKEN = "demo.demo.demo";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  // Hydrate the session once on mount.
  useEffect(() => {
    const token = getStoredAccessToken();
    const refresh = getStoredRefreshToken();

    // Clear any leftover demo token from previous sessions.
    if (token === DEMO_TOKEN) {
      clearStoredAuth();
      setStatus("unauthenticated");
      return;
    }

    if (!token && !refresh) {
      setStatus("unauthenticated");
      return;
    }

    const cachedRaw = localStorage.getItem("ng_cached_user");
    if (cachedRaw) {
      try {
        const cachedUser = JSON.parse(cachedRaw) as User;
        setSession({
          user: cachedUser,
          accessToken: token ?? "",
          refreshToken: refresh ?? "",
          expiresAt: Date.now() + 15 * 60 * 1000,
        });
        setStatus("authenticated");
      } catch { /* refresh below */ }
    }

    api.me()
      .then((user) => {
        localStorage.setItem("ng_cached_user", JSON.stringify(user));
        setSession({
          user,
          accessToken: getStoredAccessToken() ?? token ?? "",
          refreshToken: getStoredRefreshToken() ?? refresh ?? "",
          expiresAt: Date.now() + 15 * 60 * 1000,
        });
        setStatus("authenticated");
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const transient = message.includes("Сервер долго отвечает")
          || message.includes("прерван")
          || message.includes("Failed to fetch")
          || message.includes("NetworkError")
          || message.includes("aborted");

        if (transient) {
          const cached = localStorage.getItem("ng_cached_user");
          if (cached) {
            try {
              const user = JSON.parse(cached) as User;
              setSession({
                user,
                accessToken: getStoredAccessToken() ?? token ?? "",
                refreshToken: getStoredRefreshToken() ?? "",
                expiresAt: Date.now() + 15 * 60 * 1000,
              });
              setStatus("authenticated");
              return;
            } catch {
              /* fall through */
            }
          }
          // Keep the cached session visible while the backend is temporarily unavailable.
          if (cachedRaw) return;
          setStatus("unauthenticated");
          return;
        }

        clearStoredAuth();
        setStatus("unauthenticated");
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password });
    if ("challengeToken" in result) return result;
    setSession(result);
    setStatus("authenticated");
    return null;
  }, []);

  const verifyTwoFactorLogin = useCallback(async (challengeToken: string, code: string) => {
    const nextSession = await api.verifyTwoFactorLogin(challengeToken, code);
    setSession(nextSession);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string, options?: { login?: string; displayName?: string }) => {
      const s = await api.register({ username, email, password, ...options });
      setSession(s);
      setStatus("authenticated");
    },
    [],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const switchAccount = useCallback((nextSession: AuthSession) => {
    persistAuthTokens(nextSession.accessToken, nextSession.refreshToken);
    localStorage.setItem("ng_cached_user", JSON.stringify(nextSession.user));
    setSession(nextSession);
    setStatus("authenticated");
    window.dispatchEvent(new CustomEvent("nightgram:account-switch", { detail: { userId: nextSession.user.id } }));
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setSession((prev) => {
      if (!prev?.user) return prev;
      const next = { ...prev, user: { ...prev.user, ...patch } };
      localStorage.setItem("ng_cached_user", JSON.stringify(next.user));
      try {
        const raw = localStorage.getItem("ng_multi_accounts");
        const accounts = raw ? JSON.parse(raw) as AuthSession[] : [];
        const updated = accounts.map((account) => account.user?.id === next.user.id ? { ...account, user: next.user } : account);
        localStorage.setItem("ng_multi_accounts", JSON.stringify(updated));
      } catch { /* optional */ }
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isDemo: false,
      status,
      login,
      verifyTwoFactorLogin,
      register,
      logout,
      switchAccount,
      updateUser,
    }),
    [session, status, login, verifyTwoFactorLogin, register, logout, switchAccount, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
