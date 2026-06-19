"use client";

// =============================================================================
//  NightGram Web — Support / Tickets page
//  If user has tickets → list view (like messenger).
//  If not → create ticket form with categories.
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Headset, ChevronLeft, Plus, X, Send, Loader2,
  Ticket as TicketIcon, MessageCircle, Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

// Ticket categories with their specific fields
const CATEGORIES: {
  id: string;
  label: string;
  icon: string;
  desc: string;
  fields: { key: string; label: string; placeholder: string; required?: boolean }[];
}[] = [
  {
    id: "tech",
    label: "Техническая проблема",
    icon: "🔧",
    desc: "Баги, ошибки, не работает функция",
    fields: [
      { key: "subject", label: "Краткое описание проблемы", placeholder: "Например: Не загружаются фото", required: true },
      { key: "body", label: "Подробное описание", placeholder: "Опиши что произошло, на какой странице, какие шаги привели к проблеме", required: true },
    ],
  },
  {
    id: "finance",
    label: "Финансы / Покупки",
    icon: "💰",
    desc: "Premium, NightCoins, оплата",
    fields: [
      { key: "subject", label: "Что не так с покупкой?", placeholder: "Например: Купил Premium, не активировался", required: true },
      { key: "body", label: "Детали покупки", placeholder: "Укажи ID, способ оплаты, сумму и что именно купил", required: true },
    ],
  },
  {
    id: "account",
    label: "Аккаунт",
    icon: "👤",
    desc: "Вход, пароль, восстановление",
    fields: [
      { key: "subject", label: "Проблема с аккаунтом", placeholder: "Например: Не могу войти", required: true },
      { key: "body", label: "Опиши проблему", placeholder: "Что именно не работает с твоим аккаунтом?", required: true },
    ],
  },
  {
    id: "report",
    label: "Жалоба на пользователя",
    icon: "🚩",
    desc: "Нарушение правил другим юзером",
    fields: [
      { key: "subject", label: "На кого жалоба?", placeholder: "@username или ID", required: true },
      { key: "body", label: "Что произошло?", placeholder: "Опиши нарушение: спам, оскорбления, мошенничество и т.д.", required: true },
    ],
  },
  {
    id: "question",
    label: "Общий вопрос",
    icon: "❓",
    desc: "Вопрос о функциях, настройках",
    fields: [
      { key: "subject", label: "Твой вопрос", placeholder: "Например: Как сменить цвет ника?", required: true },
      { key: "body", label: "Подробнее", placeholder: "Дополнительные детали", required: false },
    ],
  },
];

const statusConfig: Record<string, { color: string; label: string }> = {
  open: { color: "#3b82f6", label: "Открыт" },
  in_progress: { color: "#fbbf24", label: "В работе" },
  resolved: { color: "#10b981", label: "Решён" },
  unresolved: { color: "#ef4444", label: "Не решён" },
  closed: { color: "#6b7280", label: "Закрыт" },
};

export default function SupportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch user's tickets (via admin endpoint, filter client-side)
      const data = await api.getTickets();
      const myTickets = (data as Record<string, unknown>[]).filter(
        (t) => String(t.authorId ?? t.author_id ?? "") === String(user?.id ?? ""),
      );
      setTickets(myTickets);
    } catch {
      setTickets([]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitTicket() {
    if (!selectedCategory) return;
    const cat = CATEGORIES.find((c) => c.id === selectedCategory);
    if (!cat) return;

    // Validate required fields
    for (const field of cat.fields) {
      if (field.required && !formData[field.key]?.trim()) return;
    }

    setSubmitting(true);
    try {
      await api.createTicket({
        subject: formData.subject || cat.label,
        body: formData.body || "",
        category: cat.label,
      });
      setFormData({});
      setSelectedCategory(null);
      setShowCreate(false);
      load();
    } catch {
      /* ignore */
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="grid place-items-center h-10 w-10 rounded-xl glass hover:border-neon-purple/50 transition">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Headset size={22} className="text-neon-purple" /> Поддержка
          </h1>
          <p className="text-sm text-white/45">Тикеты и помощь</p>
        </div>
        {tickets.length > 0 && !showCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-glow px-4 py-2 text-sm flex items-center gap-2">
            <Plus size={16} /> Новый тикет
          </button>
        )}
      </motion.div>

      {/* Create ticket mode */}
      <AnimatePresence mode="wait">
        {showCreate ? (
          <motion.div key="create" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }}>
            {/* Category selection */}
            {!selectedCategory ? (
              <div className="space-y-3">
                <p className="text-sm text-white/55 ml-1 mb-2">Выбери категорию:</p>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCategory(cat.id); setFormData({}); }}
                    className="w-full glass rounded-2xl p-4 flex items-center gap-3 transition hover:scale-[1.01] hover:brightness-110 text-left"
                  >
                    <div className="h-11 w-11 rounded-xl grid place-items-center text-2xl shrink-0 glass-strong">
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{cat.label}</div>
                      <div className="text-xs text-white/45 mt-0.5">{cat.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* Form for selected category */
              <div className="space-y-4">
                {(() => {
                  const cat = CATEGORIES.find((c) => c.id === selectedCategory)!;
                  return (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <button onClick={() => setSelectedCategory(null)} className="text-xs text-white/50 hover:text-white flex items-center gap-1">
                          <ChevronLeft size={13} /> Назад к категориям
                        </button>
                      </div>
                      <div className="glass rounded-2xl p-4 flex items-center gap-2 mb-4">
                        <span className="text-xl">{cat.icon}</span>
                        <span className="font-semibold text-sm">{cat.label}</span>
                      </div>
                      {cat.fields.map((field) => (
                        <div key={field.key}>
                          <label className="text-xs text-white/55 mb-1.5 block ml-1">
                            {field.label} {field.required && <span className="text-red-400">*</span>}
                          </label>
                          {field.key === "body" ? (
                            <textarea
                              value={formData[field.key] ?? ""}
                              onChange={(e) => setFormData((f) => ({ ...f, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              rows={4}
                              className="w-full rounded-xl glass px-4 py-3 text-sm outline-none resize-none focus:border-neon-purple/40"
                            />
                          ) : (
                            <input
                              value={formData[field.key] ?? ""}
                              onChange={(e) => setFormData((f) => ({ ...f, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="w-full rounded-xl glass px-4 py-3 text-sm outline-none focus:border-neon-purple/40"
                            />
                          )}
                        </div>
                      ))}
                      <button
                        onClick={submitTicket}
                        disabled={submitting || !cat.fields.every((f) => !f.required || formData[f.key]?.trim())}
                        className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2"
                      >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Отправить тикет
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
          </motion.div>
        ) : loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <Loader2 size={24} className="animate-spin mx-auto text-white/40" />
          </motion.div>
        ) : tickets.length === 0 ? (
          /* Empty state — no tickets yet */
          <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="h-20 w-20 rounded-full gradient-border grid place-items-center shadow-glow">
              <Headset size={36} className="text-neon-purple" />
            </div>
            <div>
              <h3 className="font-display font-bold text-xl">Нужна помощь?</h3>
              <p className="text-white/50 text-sm mt-1 max-w-xs">
                Создай тикет — наша команда поддержки поможет тебе с любым вопросом.
              </p>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-glow px-6 py-3 text-sm flex items-center gap-2">
              <Plus size={18} /> Создать тикет
            </button>
          </motion.div>
        ) : (
          /* Ticket list */
          <motion.div key="list" initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} className="space-y-3">
            {tickets.map((t) => {
              const status = String(t.status ?? "open");
              const cfg = statusConfig[status] ?? statusConfig.open;
              return (
                <div key={String(t.id)} className="glass rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:brightness-110 transition">
                  <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0 glass-strong">
                    <TicketIcon size={18} className="text-neon-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{String(t.subject ?? "")}</div>
                    <div className="text-xs text-white/45 mt-0.5">
                      {String(t.category ?? "")} · {timeAgo(String(t.createdAt ?? t.created_at ?? new Date().toISOString()))}
                    </div>
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${cfg.color}22`, color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
