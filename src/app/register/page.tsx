"use client";

// =============================================================================
//  NightGram Web — Register page
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, Mail, Lock, UserPlus, AlertCircle, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const { register, enterDemo } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      router.replace("/feed");
    } catch {
      // Backend offline — demo mode so the app stays explorable.
      enterDemo();
      router.replace("/feed");
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
            <h1 className="mt-5 font-display font-bold text-2xl">Создать аккаунт ✦</h1>
            <p className="text-white/55 text-sm mt-1">Присоединяйся к NightGram</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <Field icon={User} label="Имя пользователя">
              <input
                required
                minLength={3}
                value={form.username}
                onChange={set("username")}
                placeholder="username"
                className="ng-input"
              />
            </Field>
            <Field icon={Mail} label="Email">
              <input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                placeholder="you@nightgram.app"
                className="ng-input"
              />
            </Field>
            <Field icon={Lock} label="Пароль">
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={set("password")}
                placeholder="минимум 6 символов"
                className="ng-input"
              />
            </Field>

            <button
              type="submit"
              disabled={loading}
              className="btn-glow w-full py-3.5 inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              Зарегистрироваться
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-white/55">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-neon-purple font-semibold hover:underline">
              Войти
            </Link>
          </p>

          <button
            onClick={() => {
              enterDemo();
              router.replace("/feed");
            }}
            className="mt-3 w-full text-xs text-white/40 hover:text-neon-purple transition"
          >
            Войти в демо-режим →
          </button>
        </div>
      </motion.div>

      <style jsx>{`
        :global(.ng-input) {
          width: 100%;
          background: rgba(14, 10, 34, 0.6);
          border: 1px solid rgba(168, 85, 247, 0.2);
          border-radius: 14px;
          padding: 12px 14px 12px 42px;
          color: #fff;
          outline: none;
          transition: all 0.2s;
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
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-white/60 mb-1.5 ml-1">{label}</span>
      <div className="relative">
        <Icon size={16} className="absolute left-3.5 top-3.5 text-white/40 pointer-events-none" />
        {children}
      </div>
    </label>
  );
}
