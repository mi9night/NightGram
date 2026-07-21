"use client";

// =============================================================================
//  NightGram Web — Authenticated app shell
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/shared/AppNav";
import { AnimatePresence, motion } from "framer-motion";
import { SocketProvider } from "@/context/SocketProvider";
import { NotificationsProvider } from "@/context/NotificationsContext";
import { GlobalRuntime } from "@/components/shared/GlobalRuntime";
import { useAuth } from "@/context/AuthContext";
import { Ban, Clock3, Headset, Loader2, LogOut, Send, ShieldAlert, X } from "lucide-react";
import { api } from "@/lib/api";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealLoading, setAppealLoading] = useState(false);
  const [appealSent, setAppealSent] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = window.location.pathname;
      router.replace(`/?next=${encodeURIComponent(next)}`);
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-neon-purple/30 border-t-neon-purple animate-spin" />
          <p className="text-sm text-white/50">Загрузка NightGram…</p>
        </div>
      </div>
    );
  }

  async function submitBanAppeal() {
    if (!user?.activeBan || !appealText.trim()) return;
    const ban = user.activeBan;
    setAppealLoading(true);
    setAppealError(null);
    try {
      await api.createTicket({
        subject: `Апелляция на бан · @${user.username}`,
        category: "Апелляция бана",
        body: [
          `Пользователь: @${user.username} (#${String(user.ngId).padStart(8, "0")})`,
          `Срок бана: ${ban.expiresAt ? new Date(ban.expiresAt).toLocaleString("ru-RU") : "навсегда"}`,
          `Выдал: @${ban.issuedByName || "модерация"}`,
          `Причина: ${ban.reason || "Не указана"}`,
          "",
          "Текст апелляции:",
          appealText.trim(),
        ].join("\n"),
      });
      setAppealSent(true);
      setAppealText("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить апелляцию";
      setAppealError(message);
    } finally {
      setAppealLoading(false);
    }
  }

  if (user?.activeBan) {
    const ban = user.activeBan;
    const until = ban.expiresAt ? new Date(ban.expiresAt).toLocaleString("ru-RU") : "навсегда";
    const issuedBy = ban.issuedByName || "модерация";
    return (
      <div className="relative min-h-screen overflow-hidden px-4 py-10">
        <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: "radial-gradient(circle at 20% 18%, rgba(239,68,68,0.24), transparent 38%), radial-gradient(circle at 85% 75%, rgba(168,85,247,0.20), transparent 42%)" }} />
        <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-xl place-items-center">
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full rounded-[2rem] border border-red-400/25 bg-[#0b0612]/92 p-6 text-center shadow-[0_0_70px_rgba(239,68,68,0.18)] backdrop-blur-2xl">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl border border-red-400/30 bg-red-500/12 text-red-200 shadow-[0_0_34px_rgba(239,68,68,0.22)]">
              <ShieldAlert size={30} />
            </div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-red-100">
              <Ban size={13} /> Аккаунт заблокирован
            </div>
            <h1 className="font-display text-2xl font-black text-white">У тебя активный бан</h1>
            <p className="mt-2 text-sm text-white/55">Доступ к NightGram ограничен. Аккаунт не выкинут — статус блокировки показан здесь.</p>

            <div className="mt-5 grid gap-3 text-left sm:grid-cols-2">
              <div className="rounded-2xl glass px-4 py-3">
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-white/35"><Clock3 size={12} /> Срок</div>
                <div className="text-sm font-semibold text-red-100">{until}</div>
              </div>
              <div className="rounded-2xl glass px-4 py-3">
                <div className="mb-1 text-[11px] text-white/35">Выдал</div>
                <div className="text-sm font-semibold text-white/80">@{issuedBy}</div>
              </div>
              <div className="rounded-2xl glass px-4 py-3 sm:col-span-2">
                <div className="mb-1 text-[11px] text-white/35">Причина</div>
                <div className="text-sm font-semibold text-white/80">{ban.reason || "Не указана"}</div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button onClick={() => setAppealOpen(true)} className="btn-glow inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm">
                <Headset size={15} /> Подать апелляцию
              </button>
              <button onClick={() => void logout()} className="btn-ghost inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm">
                <LogOut size={15} /> Выйти из аккаунта
              </button>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {appealOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10100] grid place-items-center overflow-y-auto bg-black/72 p-4 py-6 sm:py-8 backdrop-blur-sm">
              <div className="absolute inset-0" onClick={() => setAppealOpen(false)} />
              <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-lg rounded-[2rem] border border-neon-purple/25 bg-[#0b0612]/96 p-5 shadow-glow-lg">
                <button onClick={() => setAppealOpen(false)} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
                <h2 className="font-display text-xl font-bold flex items-center gap-2"><Headset size={18} className="text-neon-purple" /> Апелляция на бан</h2>
                <p className="mt-1 text-xs text-white/45">Опиши, почему блокировку нужно пересмотреть. Обращение уйдёт в поддержку как тикет.</p>

                {appealSent ? (
                  <div className="mt-5 rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-center">
                    <div className="font-semibold text-emerald-200">Апелляция отправлена</div>
                    <p className="mt-1 text-sm text-white/55">Поддержка рассмотрит обращение. Если потребуется уточнение — ответ появится в тикетах после разбана или через модерацию.</p>
                    <button onClick={() => setAppealOpen(false)} className="btn-glow mt-4 px-5 py-2.5 text-sm">Понятно</button>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 rounded-3xl glass p-3 text-left text-xs text-white/55">
                      <div><b className="text-white/75">Срок:</b> {until}</div>
                      <div className="mt-1"><b className="text-white/75">Выдал:</b> @{issuedBy}</div>
                      <div className="mt-1"><b className="text-white/75">Причина:</b> {ban.reason || "Не указана"}</div>
                    </div>
                    <textarea
                      value={appealText}
                      onChange={(event) => setAppealText(event.target.value.slice(0, 1200))}
                      rows={6}
                      placeholder="Например: считаю бан ошибочным, потому что..."
                      className="ng-input mt-4 resize-none text-sm"
                    />
                    <div className="mt-1 text-right text-[11px] text-white/30">{appealText.length}/1200</div>
                    {appealError && <div className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{appealError}</div>}
                    <button onClick={submitBanAppeal} disabled={appealLoading || appealText.trim().length < 20} className="btn-glow mt-4 w-full py-3 text-sm disabled:opacity-45">
                      {appealLoading ? <Loader2 size={15} className="mr-1 inline animate-spin" /> : <Send size={15} className="mr-1 inline" />}
                      Отправить апелляцию
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <SocketProvider>
      <NotificationsProvider>
        <div className="ng-app-shell">
          <AppNav />
          <main className="ng-app-content">{children}</main>
          <GlobalRuntime />
        </div>
      </NotificationsProvider>
    </SocketProvider>
  );
}
