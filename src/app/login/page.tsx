"use client";

// =============================================================================
//  NightGram Web — Login page (real backend auth, no demo fallback)
// =============================================================================

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, Lock, LogIn, AlertCircle, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center">
          <div className="h-10 w-10 rounded-full border-2 border-neon-purple/30 border-t-neon-purple animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/feed";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка входа";
      if (msg.includes("Сервер долго отвечает") || msg.includes("прерван") || msg.includes("aborted")) {
        setError("Сервер долго отвечает. Railway мог уйти в сон — подожди 10–20 секунд и нажми войти ещё раз.");
      } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Не удалось подключиться к серверу. Проверьте интернет или попробуйте позже.");
      } else if (msg.includes("502") || msg.includes("Backend proxy failed")) {
        setError("Vercel не смог связаться с backend. Проверь BACKEND_API_URL/NEXT_PUBLIC_API_URL и что Railway запущен.");
      } else if (msg.includes("401") || msg.includes("Invalid")) {
        setError("Неверный email или пароль.");
      } else {
        setError("Ошибка: " + msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen grid place-items-center px-6 py-16">
      <AuroraBackground intensity={1.1} />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 90, damping: 14 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="gradient-border rounded-4xl glass-strong p-8 shadow-glow-lg">
          <div className="flex flex-col items-center text-center mb-7">
            <NightGramWordmark size={44} />
            <h1 className="mt-5 font-display font-bold text-2xl">С возвращением ✦</h1>
            <p className="text-white/55 text-sm mt-1">Войдите, чтобы продолжить</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <Field icon={Mail} label="Email" active={Boolean(email)}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nightgram.app"
                className="ng-input ng-input-with-icon"
              />
            </Field>
            <Field icon={Lock} label="Пароль" active={Boolean(password)}>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="ng-input ng-input-with-icon"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="btn-glow w-full py-3.5 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              Войти
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/55">
            Нет аккаунта?{" "}
            <Link href="/register" className="text-neon-purple font-semibold hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </motion.div>

      <style jsx>{`
        :global(.ng-input) {
          width: 100%;
          background: rgba(14, 10, 34, 0.6);
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 14px;
          padding: 12px 14px;
          color: #fff;
          outline: none;
          transition: all 0.2s;
        }
        :global(.ng-input.ng-input-with-icon) {
          padding-left: 56px !important;
        }
        :global(.ng-input:focus) {
          border-color: rgba(168, 85, 247, 0.6);
          box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15);
        }
        :global(.ng-input::placeholder) {
          color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </main>
  );
}

function Field({
  icon: Icon,
  label,
  active = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const hideIcon = active || focused;
  return (
    <label className="block">
      <span className="block text-xs text-white/60 mb-1.5 ml-1">{label}</span>
      <div
        className={`relative ng-icon-field ${hideIcon ? "is-active" : ""}`}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
      >
        <span className={`ng-field-icon pointer-events-none absolute inset-y-0 left-4 flex w-5 items-center justify-center text-white/40 ${hideIcon ? "opacity-0 scale-90" : ""}`}>
          <Icon size={16} strokeWidth={1.9} />
        </span>
        {children}
      </div>
    </label>
  );
}
