"use client";

// =============================================================================
//  NightGram Web — Auth context
//  Holds the session in memory + localStorage, hydrates on mount, and exposes
//  login / register / logout. Gracefully falls back to demo mode when the
//  backend is offline so the full UI is always explorable.
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
import { mockUser } from "@/lib/mock";

interface AuthContextValue {
  user: User | null;
  status: "loading" | "authenticated" | "unauthenticated";
  isDemo: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  enterDemo: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_TOKEN = "demo.demo.demo";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");
  const [isDemo, setIsDemo] = useState(false);

  // Hydrate the session once on mount.
  useEffect(() => {
    const token = localStorage.getItem("ng_access_token");
    if (!token) {
      setStatus("unauthenticated");
      return;
    }
    // Demo token → use the mock user, no network needed.
    if (token === DEMO_TOKEN) {
      setSession({
        user: mockUser(),
        accessToken: token,
        refreshToken: token,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
      setIsDemo(true);
      setStatus("authenticated");
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
    setIsDemo(false);
    setStatus("authenticated");
  }, []);

  const register = useCallback(
    async (username: string, email: string, password: string) => {
      const s = await api.register({ username, email, password });
      setSession(s);
      setIsDemo(false);
      setStatus("authenticated");
    },
    [],
  );

  // Demo entry — sets a local token + mock user, no backend required.
  const enterDemo = useCallback(() => {
    localStorage.setItem("ng_access_token", DEMO_TOKEN);
    localStorage.setItem("ng_refresh_token", DEMO_TOKEN);
    setSession({
      user: mockUser(),
      accessToken: DEMO_TOKEN,
      refreshToken: DEMO_TOKEN,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    setIsDemo(true);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setSession(null);
    setIsDemo(false);
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
      isDemo,
      login,
      register,
      logout,
      updateUser,
      enterDemo,
    }),
    [session, status, isDemo, login, register, logout, updateUser, enterDemo],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
