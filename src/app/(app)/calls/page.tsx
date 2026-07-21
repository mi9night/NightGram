"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Clock3, Loader2, Phone, PhoneMissed, RefreshCw, Video } from "lucide-react";
import { api } from "@/lib/api";
import type { CallHistoryEntry } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";

const statusLabels: Record<CallHistoryEntry["status"], string> = {
  ringing: "Звонит",
  active: "Идёт сейчас",
  completed: "Завершён",
  missed: "Пропущен",
  rejected: "Отклонён",
  cancelled: "Отменён",
  failed: "Ошибка",
};

function durationLabel(seconds?: number | null) {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function startAgain(entry: CallHistoryEntry, type: "audio" | "video") {
  window.dispatchEvent(new CustomEvent("nightgram:start-call", {
    detail: {
      conversationId: entry.conversationId,
      title: entry.conversationTitle || "Звонок NightGram",
      avatarUrl: entry.avatarUrl || null,
      type,
      participants: entry.participantIds,
    },
  }));
}

export default function CallsPage() {
  const [items, setItems] = useState<CallHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await api.getCallHistory(80));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить историю");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-400/25 bg-violet-500/10 text-violet-200"><Phone size={20} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">Звонки</h1>
          <p className="text-sm text-white/45">Входящие, исходящие и пропущенные</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-ghost grid h-10 w-10 place-items-center p-0" aria-label="Обновить">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="grid min-h-56 place-items-center text-white/45"><Loader2 className="animate-spin" /></div>
      ) : error ? (
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-200">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-[2rem] glass-strong p-8 text-center">
          <PhoneMissed className="mx-auto text-white/25" size={34} />
          <div className="mt-3 font-semibold">История пока пустая</div>
          <p className="mt-1 text-sm text-white/45">После первого звонка он появится здесь.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((entry, index) => {
            const missed = entry.status === "missed" || entry.status === "rejected" || entry.status === "failed";
            const DirectionIcon = entry.direction === "incoming" ? ArrowDownLeft : ArrowUpRight;
            return (
              <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.02, 0.25) }} className="flex items-center gap-3 rounded-3xl glass-strong p-3.5">
                <GlowAvatar src={entry.avatarUrl || null} alt={entry.conversationTitle || "Звонок"} size={48} glow="purple" />
                <Link href={`/messages?conversation=${encodeURIComponent(entry.conversationId)}`} className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{entry.conversationTitle || (entry.isGroup ? "Групповой звонок" : `@${entry.initiatorUsername || "user"}`)}</div>
                  <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs ${missed ? "text-red-300" : "text-white/45"}`}>
                    <DirectionIcon size={13} />
                    <span>{statusLabels[entry.status]}</span>
                    <span>·</span>
                    <span>{entry.callType === "video" ? "Видео" : "Аудио"}</span>
                    {entry.isGroup && <><span>·</span><span>{entry.participantIds.length} участников</span></>}
                    {durationLabel(entry.durationSec) && <><span>·</span><Clock3 size={12} /><span>{durationLabel(entry.durationSec)}</span></>}
                  </div>
                  <div className="mt-1 text-[11px] text-white/30">{new Date(entry.startedAt).toLocaleString("ru-RU")}</div>
                </Link>
                <div className="flex gap-1.5">
                  <button onClick={() => startAgain(entry, "audio")} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/65 hover:text-emerald-200" aria-label="Позвонить"><Phone size={15} /></button>
                  <button onClick={() => startAgain(entry, "video")} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/65 hover:text-violet-200" aria-label="Видеозвонок"><Video size={16} /></button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
