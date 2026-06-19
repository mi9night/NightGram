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
import type { AuthSession, User } from "@/types";
import { api } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  status: "loading" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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
    const token = localStorage.getItem("ng_access_token");

    // Clear any leftover demo token from previous sessions.
    if (token === DEMO_TOKEN) {
      localStorage.removeItem("ng_access_token");
      localStorage.removeItem("ng_refresh_token");
      setStatus("unauthenticated");
      return;
    }

    if (!token) {
      setStatus("unauthenticated");
      return;
    }

    api
      .me()
      .then((user) => {
        setSession({
          user,
          accessToken: token,
          refreshToken: localStorage.getItem("ng_refresh_token") ?? "",
          expiresAt: Date.now() + 15 * 60 * 1000,
        });
        setStatus("authenticated");
      })
      .catch(() => {
        localStorage.removeItem("ng_access_token");
        localStorage.removeItem("ng_refresh_token");
        setStatus("unauthenticated");
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await api.login({ email, password });
    setSession(s);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const s = await api.register({ username, email, password });
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

  const updateUser = useCallback((patch: Partial<User>) => {
    setSession((prev) =>
      prev && prev.user ? { ...prev, user: { ...prev.user, ...patch } } : prev,
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      status,
      login,
      register,
      logout,
      updateUser,
    }),
    [session, status, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
