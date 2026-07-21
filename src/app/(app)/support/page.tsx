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
  local: { color: "#a855f7", label: "Локально" },
};

function loadLocalTickets(): Record<string, unknown>[] {
  try { return JSON.parse(localStorage.getItem("ng_local_tickets") || "[]") as Record<string, unknown>[]; }
  catch { return []; }
}
function saveLocalTicket(ticket: Record<string, unknown>) {
  const next = [ticket, ...loadLocalTickets()].slice(0, 50);
  localStorage.setItem("ng_local_tickets", JSON.stringify(next));
  return next;
}

export default function SupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Record<string, unknown>[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const activeTicket = tickets.find((t) => String(t.id) === String(activeId)) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await Promise.race([
        api.getMyTickets(),
        new Promise<unknown[]>((resolve) => setTimeout(() => resolve([]), 15000)),
      ]);
      const remote = data as Record<string, unknown>[];
      const next = remote.length > 0 ? remote : loadLocalTickets();
      setTickets(next);
      setActiveId((current) => current ?? (next[0] ? String(next[0].id) : null));
    } catch {
      const local = loadLocalTickets();
      setTickets(local);
      setActiveId((current) => current ?? (local[0] ? String(local[0].id) : null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeId || String(activeId).startsWith("local-")) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessagesLoading(true);
    api.getTicketMessages(activeId)
      .then((data) => active && setMessages(data as Record<string, unknown>[]))
      .catch(() => active && setMessages([]))
      .finally(() => active && setMessagesLoading(false));
    return () => { active = false; };
  }, [activeId]);

  async function sendTicketReply() {
    if (!activeId || !replyText.trim() || String(activeId).startsWith("local-")) return;
    setReplying(true);
    try {
      const msg = await api.replyTicket(activeId, replyText.trim());
      setMessages((prev) => [...prev, msg as Record<string, unknown>]);
      setReplyText("");
    } catch {
      // keep typed text for retry
    }
    setReplying(false);
  }

  async function submitTicket() {
    if (!selectedCategory) return;
    const cat = CATEGORIES.find((c) => c.id === selectedCategory);
    if (!cat) return;
    for (const field of cat.fields) {
      if (field.required && !formData[field.key]?.trim()) return;
    }

    setSubmitting(true);
    try {
      const created = await api.createTicket({
        subject: formData.subject || cat.label,
        body: formData.body || "",
        category: cat.label,
      }) as Record<string, unknown>;
      setTickets((prev) => [created, ...prev]);
      setActiveId(String(created.id));
      setFormData({});
      setSelectedCategory(null);
      setShowCreate(false);
    } catch {
      const localTicket = {
        id: `local-${Date.now()}`,
        subject: formData.subject || cat.label,
        body: formData.body || "",
        category: cat.label,
        status: "local",
        createdAt: new Date().toISOString(),
      };
      setTickets(saveLocalTicket(localTicket));
      setActiveId(String(localTicket.id));
      setFormData({});
      setSelectedCategory(null);
      setShowCreate(false);
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pb-24 md:pb-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="grid place-items-center h-10 w-10 rounded-xl glass hover:border-neon-purple/50 transition">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Headset size={22} className="text-neon-purple" /> Поддержка
          </h1>
          <p className="text-sm text-white/45">Тикеты как диалоги с командой поддержки</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-glow px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> Новый тикет
        </button>
      </motion.div>

      <div className="grid gap-4 h-[calc(100vh-11rem)] md:grid-cols-[340px_1fr]">
        {/* Ticket list */}
        <div className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${activeId ? "hidden md:flex" : "flex"} flex-col`}>
          <div className="p-4 border-b border-white/5">
            <h2 className="font-display font-bold text-xl">Тикеты</h2>
            <p className="text-xs text-white/45 mt-1">Выбери обращение, чтобы открыть чат</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <SupportSkeleton />
            ) : tickets.length === 0 ? (
              <div className="h-full grid place-items-center text-center text-white/40 p-6">
                <div>
                  <Headset size={36} className="mx-auto mb-3 text-neon-purple" />
                  <p className="text-sm">Тикетов пока нет</p>
                  <button onClick={() => setShowCreate(true)} className="btn-glow mt-4 px-4 py-2 text-sm">Создать тикет</button>
                </div>
              </div>
            ) : tickets.map((ticket) => (
              <TicketRow
                key={String(ticket.id)}
                ticket={ticket}
                active={String(ticket.id) === String(activeId)}
                onClick={() => setActiveId(String(ticket.id))}
              />
            ))}
          </div>
        </div>

        {/* Ticket chat */}
        <div className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${!activeId ? "hidden md:flex" : "flex"} flex-col`}>
          {activeTicket ? (
            <>
              <div className="flex items-center gap-3 p-3 border-b border-white/5 glass-strong">
                <button onClick={() => setActiveId(null)} className="md:hidden grid place-items-center h-9 w-9 rounded-lg glass">
                  <ChevronLeft size={18} />
                </button>
                <div className="h-11 w-11 rounded-2xl grid place-items-center glass-strong shrink-0">
                  <TicketIcon size={20} className="text-neon-purple" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{String(activeTicket.subject ?? "Тикет")}</div>
                  <div className="text-xs text-white/45 truncate">{String(activeTicket.category ?? "Вопрос")} · {statusConfig[String(activeTicket.status ?? "open")]?.label ?? "Открыт"}</div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <TicketMessageBubble
                  mine
                  label="Вы создали тикет"
                  text={String(activeTicket.body ?? "") || String(activeTicket.subject ?? "")}
                  date={String(activeTicket.createdAt ?? activeTicket.created_at ?? new Date().toISOString())}
                />

                {messagesLoading ? (
                  <div className="py-8 text-center text-white/40"><Loader2 size={20} className="animate-spin mx-auto" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-white/35 text-sm py-8">Ответов пока нет</div>
                ) : messages.map((msg) => {
                  const role = String(msg.authorRole ?? msg.author_role ?? "user");
                  return (
                    <TicketMessageBubble
                      key={String(msg.id)}
                      mine={role !== "support" && role !== "admin"}
                      label={role === "support" || role === "admin" ? "Поддержка" : "Вы"}
                      text={String(msg.text ?? "")}
                      date={String(msg.createdAt ?? msg.created_at ?? new Date().toISOString())}
                    />
                  );
                })}
              </div>

              <div className="p-3 border-t border-white/5 glass-strong">
                {String(activeId).startsWith("local-") ? (
                  <div className="rounded-2xl glass px-3 py-2 text-xs text-white/45">Локальный тикет нельзя отправлять в чат, пока backend недоступен.</div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); sendTicketReply(); }} className="flex items-center gap-2">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Написать в поддержку…"
                      className="flex-1 rounded-full glass px-4 py-2.5 text-sm outline-none focus:border-neon-purple/40"
                    />
                    <button type="submit" disabled={replying || !replyText.trim()} className="grid place-items-center h-10 w-10 rounded-full btn-glow disabled:opacity-40">
                      {replying ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="h-full grid place-items-center text-center text-white/40 p-8">
              <div>
                <MessageCircle size={38} className="mx-auto mb-3 text-neon-purple" />
                <p>Выбери тикет или создай новый</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateTicketModal
        open={showCreate}
        selectedCategory={selectedCategory}
        formData={formData}
        submitting={submitting}
        onClose={() => { setShowCreate(false); setSelectedCategory(null); setFormData({}); }}
        onSelectCategory={(id) => { setSelectedCategory(id); setFormData({}); }}
        onBack={() => setSelectedCategory(null)}
        onFormChange={(key, value) => setFormData((f) => ({ ...f, [key]: value }))}
        onSubmit={submitTicket}
      />
    </div>
  );
}

function TicketRow({ ticket, active, onClick }: { ticket: Record<string, unknown>; active: boolean; onClick: () => void }) {
  const status = String(ticket.status ?? "open");
  const cfg = statusConfig[status] ?? statusConfig.open;
  return (
    <motion.button
      layout
      whileHover={{ x: 2 }}
      onClick={onClick}
      className={cn("w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition relative", active ? "glass-strong shadow-glow" : "hover:bg-white/5")}
    >
      {active && <motion.span layoutId="ticket-active" className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-neon-purple" style={{ boxShadow: "0 0 10px var(--accent-main)" }} />}
      <div className="h-12 w-12 rounded-2xl grid place-items-center glass shrink-0"><TicketIcon size={20} className="text-neon-purple" /></div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate text-sm">{String(ticket.subject ?? "Тикет")}</div>
        <div className="text-xs text-white/45 truncate">{String(ticket.category ?? "")} · {timeAgo(String(ticket.createdAt ?? ticket.created_at ?? new Date().toISOString()))}</div>
      </div>
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>
    </motion.button>
  );
}

function TicketMessageBubble({ mine, label, text, date }: { mine: boolean; label: string; text: string; date: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", mine ? "justify-end" : "justify-start")}> 
      <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2.5", mine ? "rounded-br-md bg-gradient-to-br from-neon-purple to-neon-indigo text-white" : "rounded-bl-md glass text-white/90")}> 
        <div className={cn("text-[10px] mb-1", mine ? "text-white/60" : "text-neon-purple")}>{label}</div>
        <div className="text-sm whitespace-pre-wrap break-words">{text}</div>
        <div className="mt-1 text-[10px] text-white/35 text-right">{timeAgo(date)}</div>
      </div>
    </motion.div>
  );
}

function SupportSkeleton() {
  return <div className="p-3 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-3"><div className="skeleton h-12 w-12 rounded-2xl"/><div className="flex-1 space-y-2"><div className="skeleton h-4 w-32 rounded"/><div className="skeleton h-3 w-44 rounded"/></div></div>)}</div>;
}

function CreateTicketModal({
  open,
  selectedCategory,
  formData,
  submitting,
  onClose,
  onSelectCategory,
  onBack,
  onFormChange,
  onSubmit,
}: {
  open: boolean;
  selectedCategory: string | null;
  formData: Record<string, string>;
  submitting: boolean;
  onClose: () => void;
  onSelectCategory: (id: string) => void;
  onBack: () => void;
  onFormChange: (key: string, value: string) => void;
  onSubmit: () => void;
}) {
  const cat = selectedCategory ? CATEGORIES.find((c) => c.id === selectedCategory) : null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-lg ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white"><X size={16}/></button>
            <h3 className="font-display font-bold text-xl mb-4">Новый тикет</h3>
            {!cat ? (
              <div className="space-y-3">
                {CATEGORIES.map((category) => (
                  <button key={category.id} onClick={() => onSelectCategory(category.id)} className="w-full glass rounded-2xl p-4 flex items-center gap-3 transition hover:scale-[1.01] hover:brightness-110 text-left">
                    <div className="h-11 w-11 rounded-xl grid place-items-center text-2xl shrink-0 glass-strong">{category.icon}</div>
                    <div className="flex-1 min-w-0"><div className="font-semibold text-sm">{category.label}</div><div className="text-xs text-white/45 mt-0.5">{category.desc}</div></div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={onBack} className="text-xs text-white/50 hover:text-white flex items-center gap-1"><ChevronLeft size={13}/> Назад</button>
                <div className="glass rounded-2xl p-4 flex items-center gap-2"><span className="text-xl">{cat.icon}</span><span className="font-semibold text-sm">{cat.label}</span></div>
                {cat.fields.map((field) => (
                  <div key={field.key}>
                    <label className="text-xs text-white/55 mb-1.5 block ml-1">{field.label} {field.required && <span className="text-red-400">*</span>}</label>
                    {field.key === "body" ? (
                      <textarea value={formData[field.key] ?? ""} onChange={(e) => onFormChange(field.key, e.target.value)} placeholder={field.placeholder} rows={4} className="w-full rounded-xl glass px-4 py-3 text-sm outline-none resize-none focus:border-neon-purple/40" />
                    ) : (
                      <input value={formData[field.key] ?? ""} onChange={(e) => onFormChange(field.key, e.target.value)} placeholder={field.placeholder} className="w-full rounded-xl glass px-4 py-3 text-sm outline-none focus:border-neon-purple/40" />
                    )}
                  </div>
                ))}
                <button onClick={onSubmit} disabled={submitting || !cat.fields.every((f) => !f.required || formData[f.key]?.trim())} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2">
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Отправить тикет
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
