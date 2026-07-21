"use client";

// =============================================================================
//  NightGram Web — Register page
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { User, Mail, Lock, UserPlus, AlertCircle, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AuroraBackground } from "@/components/shared/AuroraBackground";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ login: "", username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [usernameCheck, setUsernameCheck] = useState<{ checking: boolean; available: boolean | null; reason?: string | null; normalized?: string }>({ checking: false, available: null });
  const [usernameFocused, setUsernameFocused] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = k === "username"
      ? e.target.value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 24)
      : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };

  useEffect(() => {
    const username = form.username.trim();
    if (username.length < 3) {
      setUsernameCheck({ checking: false, available: null, reason: username ? "Минимум 3 символа" : null });
      return;
    }
    setUsernameCheck((prev) => ({ ...prev, checking: true }));
    const timer = window.setTimeout(() => {
      api.checkUsername(username)
        .then((res) => setUsernameCheck({ checking: false, available: res.available, reason: res.reason, normalized: res.username }))
        .catch(() => setUsernameCheck({ checking: false, available: null, reason: "Не удалось проверить" }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [form.username]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (usernameCheck.available === false) {
        setError(usernameCheck.reason || "Юзернейм уже занят");
        return;
      }
      await register(form.username, form.email, form.password, { login: form.login, displayName: form.login });
      router.replace("/feed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка регистрации";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Не удалось подключиться к серверу. Проверьте интернет или попробуйте позже.");
      } else if (msg.includes("Юзернейм") || msg.includes("username")) {
        setError(msg.replace(/^API \d+: /, ""));
      } else if (msg.includes("409") || msg.includes("already") || msg.includes("duplicate")) {
        setError("Этот email или юзернейм уже занят. Попробуйте другой.");
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
            <h1 className="mt-5 font-display font-bold text-2xl">Создать аккаунт ✦</h1>
            <p className="text-white/55 text-sm mt-1">Присоединяйся к NightGram</p>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <Field icon={User} label="Логин" active={Boolean(form.login)}>
              <input
                required
                minLength={2}
                maxLength={32}
                value={form.login}
                onChange={set("login")}
                placeholder="Как вас показывать"
                className="ng-input ng-input-with-icon"
              />
            </Field>
            <label className="block">
              <span className="block text-xs text-white/60 mb-1.5 ml-1">Юзернейм</span>
              <div className={`ng-combo-input ${usernameFocused || form.username ? "is-active" : ""}`}>
                <span className="ng-combo-prefix">@</span>
                <input
                  required
                  minLength={3}
                  maxLength={24}
                  value={form.username}
                  onChange={set("username")}
                  onFocus={() => setUsernameFocused(true)}
                  onBlur={() => setUsernameFocused(false)}
                  placeholder="username"
                  className="ng-combo-control"
                />
              </div>
              <div className="mt-1.5 min-h-4 text-[11px]">
                {usernameCheck.checking ? (
                  <span className="text-white/35">Проверяем username…</span>
                ) : usernameCheck.available === true ? (
                  <span className="text-emerald-300">@{usernameCheck.normalized || form.username} свободен</span>
                ) : usernameCheck.available === false ? (
                  <span className="text-red-300">{usernameCheck.reason || "Юзернейм уже занят"}</span>
                ) : usernameCheck.reason ? (
                  <span className="text-white/35">{usernameCheck.reason}</span>
                ) : (
                  <span className="text-white/30">3–24 символа: латиница, цифры и _</span>
                )}
              </div>
            </label>
            <Field icon={Mail} label="Почта" active={Boolean(form.email)}>
              <input
                type="email"
                required
                maxLength={254}
                value={form.email}
                onChange={set("email")}
                placeholder="you@nightgram.app"
                className="ng-input ng-input-with-icon"
              />
            </Field>
            <Field icon={Lock} label="Пароль" active={Boolean(form.password)}>
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                value={form.password}
                onChange={set("password")}
                placeholder="минимум 8 символов"
                className="ng-input ng-input-with-icon"
              />
            </Field>


            <button
              type="submit"
              disabled={loading || usernameCheck.available === false || usernameCheck.checking}
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
  icon: LucideIcon | null;
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
        className={Icon ? `relative ng-icon-field ${hideIcon ? "is-active" : ""}` : "relative"}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
      >
        {Icon && (
          <span className={`ng-field-icon pointer-events-none absolute inset-y-0 left-4 flex w-5 items-center justify-center text-white/40 ${hideIcon ? "opacity-0 scale-90" : ""}`}>
            <Icon size={16} strokeWidth={1.9} />
          </span>
        )}
        {children}
      </div>
    </label>
  );
}
