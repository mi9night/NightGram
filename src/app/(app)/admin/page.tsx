"use client";

// =============================================================================
//  NightGram Web — Admin Panel (moderation)
//  Tabs: Тикеты · Пользователи · Наказания · Жалобы · Финансы · Рассылка · Журнал
// =============================================================================

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Ticket, Users, Gavel, Flag, DollarSign, Megaphone, ScrollText,
  Search, Ban, MicOff, AlertTriangle, Shield, Crown, ChevronLeft,
  Check, X, Loader2, UserCheck, Eye,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

type Tab = "tickets" | "users" | "punishments" | "reports" | "finance" | "broadcast" | "log";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "tickets", label: "Тикеты", icon: Ticket },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "punishments", label: "Наказания", icon: Gavel },
  { id: "reports", label: "Жалобы", icon: Flag },
  { id: "finance", label: "Финансы", icon: DollarSign },
  { id: "broadcast", label: "Рассылка", icon: Megaphone },
  { id: "log", label: "Журнал", icon: ScrollText },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("tickets");

  const isAdmin = user?.role === "admin" || user?.role === "owner" || user?.role === "co_owner" || user?.role === "moderator" || user?.role === "support";

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 pt-20 text-center">
        <Shield size={48} className="mx-auto mb-4 text-white/30" />
        <h1 className="font-display font-bold text-xl">Доступ запрещён</h1>
        <p className="text-sm text-white/45 mt-2">Эта страница доступна только модераторам и администраторам.</p>
        <Link href="/feed" className="btn-glow mt-5 inline-block px-5 py-2.5 text-sm">На главную</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-12">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
        <Link href="/feed" className="grid place-items-center h-10 w-10 rounded-xl glass hover:border-neon-purple/50 transition">
          <ChevronLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Shield size={22} className="text-neon-purple" /> Админ-панель
          </h1>
          <p className="text-sm text-white/45">Модерация и управление NightGram</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-5">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm whitespace-nowrap transition",
                tab === t.id
                  ? "bg-neon-purple/20 text-white border border-neon-purple/40 shadow-glow"
                  : "glass text-white/55 hover:text-white",
              )}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -15 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "tickets" && <TicketsSection />}
          {tab === "users" && <UsersSection />}
          {tab === "punishments" && <PunishmentsSection />}
          {tab === "reports" && <ReportsSection />}
          {tab === "finance" && <FinanceSection />}
          {tab === "broadcast" && <BroadcastSection />}
          {tab === "log" && <LogSection />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ==== Tickets ====

function TicketsSection() {
  const [filter, setFilter] = useState("all");
  const tickets = [
    { id: "t1", subject: "Не работает вход", category: "Тех. поддержка", status: "open", authorName: "user1", priority: "high", createdAt: "2 мин назад" },
    { id: "t2", subject: "Купил Premium, не активировался", category: "Финансы", status: "in_progress", authorName: "user2", priority: "high", createdAt: "1 ч назад" },
    { id: "t3", subject: "Жалоба на пользователя @spam_bot", category: "Жалоба", status: "resolved", authorName: "user3", priority: "medium", createdAt: "3 ч назад" },
    { id: "t4", subject: "Как сменить цвет ника?", category: "Вопрос", status: "unresolved", authorName: "user4", priority: "low", createdAt: "5 ч назад" },
  ];
  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  const statusColors: Record<string, string> = {
    open: "#3b82f6", in_progress: "#fbbf24", resolved: "#10b981", unresolved: "#ef4444", closed: "#6b7280",
  };
  const statusLabels: Record<string, string> = {
    open: "Открыт", in_progress: "В работе", resolved: "Решён", unresolved: "Не решён", closed: "Закрыт",
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {["all", "open", "in_progress", "resolved", "unresolved"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition", filter === f ? "bg-neon-purple/20 text-white border border-neon-purple/40" : "glass text-white/55")}>
            {f === "all" ? "Все" : statusLabels[f]}
          </button>
        ))}
      </div>
      {filtered.map((t) => (
        <div key={t.id} className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{t.subject}</div>
            <div className="text-xs text-white/45 mt-0.5">{t.category} · @{t.authorName} · {t.createdAt}</div>
          </div>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${statusColors[t.status]}22`, color: statusColors[t.status] }}>
            {statusLabels[t.status]}
          </span>
          <button className="btn-ghost px-3 py-1.5 text-xs shrink-0">Открыть</button>
        </div>
      ))}
    </div>
  );
}

// ==== Users ====

function UsersSection() {
  const [search, setSearch] = useState("");
  const users = [
    { id: "u1", ngId: "10000001", username: "midnight", role: "owner", verified: true, premium: true, banned: false },
    { id: "u2", ngId: "10000002", username: "testbot123", role: "user", verified: false, premium: false, banned: false },
    { id: "u3", ngId: "10000003", username: "spam_user", role: "user", verified: false, premium: false, banned: true },
  ];
  const filtered = users.filter((u) => u.username.includes(search.toLowerCase()) || u.ngId.includes(search));

  const roleColors: Record<string, string> = {
    owner: "#fbbf24", co_owner: "#a855f7", admin: "#ef4444", moderator: "#3b82f6", support: "#22d3ee", user: "#9ca3af", creator: "#ec4899",
  };
  const roleLabels: Record<string, string> = {
    owner: "Владелец", co_owner: "Зам. владельца", admin: "Админ", moderator: "Модератор", support: "Саппорт", user: "Юзер", creator: "Креатор",
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ID или нику…" className="w-full rounded-xl glass pl-9 pr-3 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
      </div>
      {filtered.map((u) => (
        <div key={u.id} className="glass rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl glass grid place-items-center shrink-0">
            <Users size={18} className="text-white/50" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-2">
              @{u.username}
              {u.verified && <UserCheck size={13} className="text-neon-purple" />}
              {u.premium && <Crown size={13} style={{ color: "#fbbf24" }} />}
              {u.banned && <Ban size={13} className="text-red-400" />}
            </div>
            <div className="text-xs text-white/45">#{u.ngId}</div>
          </div>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${roleColors[u.role]}22`, color: roleColors[u.role] }}>
            {roleLabels[u.role]}
          </span>
          <button className="btn-ghost px-3 py-1.5 text-xs shrink-0">Действия</button>
        </div>
      ))}
    </div>
  );
}

// ==== Punishments ====

function PunishmentsSection() {
  const punishments = [
    { id: "p1", username: "spam_user", type: "ban", reason: "Спам в комментариях", duration: "7 дней", admin: "midnight", createdAt: "1 ч назад", active: true },
    { id: "p2", username: "toxic_user", type: "mute_posts", reason: "Оскорбления", duration: "3 дня", admin: "midnight", createdAt: "2 ч назад", active: true },
    { id: "p3", username: "newbie", type: "warning", reason: "Первое предупреждение", duration: "—", admin: "midnight", createdAt: "5 ч назад", active: true },
  ];

  const typeConfig: Record<string, { icon: LucideIcon; color: string; label: string }> = {
    ban: { icon: Ban, color: "#ef4444", label: "Бан" },
    mute_dm: { icon: MicOff, color: "#fbbf24", label: "Мут ЛС" },
    mute_posts: { icon: MicOff, color: "#f97316", label: "Мут постов" },
    warning: { icon: AlertTriangle, color: "#3b82f6", label: "Предупреждение" },
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/45 ml-1">Активные наказания пользователей</p>
      {punishments.map((p) => {
        const cfg = typeConfig[p.type];
        const Icon = cfg.icon;
        return (
          <div key={p.id} className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: `${cfg.color}22` }}>
              <Icon size={18} style={{ color: cfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">@{p.username}</div>
              <div className="text-xs text-white/45 mt-0.5">{p.reason} · {p.duration} · выдал @{p.admin}</div>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${cfg.color}22`, color: cfg.color }}>
              {cfg.label}
            </span>
            <button className="btn-ghost px-3 py-1.5 text-xs shrink-0">Снять</button>
          </div>
        );
      })}
    </div>
  );
}

// ==== Reports ====

function ReportsSection() {
  const reports = [
    { id: "r1", targetType: "post", targetId: "p_123", category: "spam", reason: "Реклама в посте", reporterName: "user1", status: "pending", createdAt: "10 мин" },
    { id: "r2", targetType: "comment", targetId: "c_456", category: "scam", reason: "Мошенническая ссылка", reporterName: "user2", status: "pending", createdAt: "30 мин" },
    { id: "r3", targetType: "user", targetId: "u_789", category: "harassment", reason: "Травля в ЛС", reporterName: "user3", status: "actioned", createdAt: "2 ч" },
  ];

  const catLabels: Record<string, string> = {
    spam: "Спам", scam: "Мошенничество", harassment: "Травля", nsfw: "18+ контент", violence: "Насилие", copyright: "Авторские права", other: "Другое",
  };

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="glass rounded-2xl p-4 flex items-center gap-3">
          <Flag size={18} className="text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{catLabels[r.category]}</div>
            <div className="text-xs text-white/45 mt-0.5">{r.reason} · @{r.reporterName} · {r.createdAt} назад</div>
          </div>
          {r.status === "pending" ? (
            <div className="flex gap-1.5 shrink-0">
              <button className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#34d399" }}>Принять</button>
              <button className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171" }}>Отклонить</button>
            </div>
          ) : (
            <span className="text-xs text-white/40 shrink-0">Обработано</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ==== Finance ====

function FinanceSection() {
  const requests = [
    { id: "f1", username: "user2", ngId: "10000002", itemType: "premium", itemName: "Premium 1 год", price: 1390, status: "pending", createdAt: "30 мин" },
    { id: "f2", username: "user5", ngId: "10000005", itemType: "coins", itemName: "500 NightCoins", price: 520, status: "pending", createdAt: "1 ч" },
    { id: "f3", username: "user1", ngId: "10000001", itemType: "premium", itemName: "Premium 1 месяц", price: 230, status: "approved", createdAt: "3 ч" },
  ];

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: "#fbbf24", label: "Ожидание" },
    approved: { color: "#10b981", label: "Одобрено" },
    rejected: { color: "#ef4444", label: "Отклонено" },
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/45 ml-1">Заявки на покупку — подтвердите оплату для активации</p>
      {requests.map((r) => {
        const cfg = statusConfig[r.status];
        return (
          <div key={r.id} className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: r.itemType === "premium" ? "rgba(251,191,36,0.12)" : "rgba(168,85,247,0.12)" }}>
              {r.itemType === "premium" ? <Crown size={18} style={{ color: "#fbbf24" }} /> : <DollarSign size={18} className="text-neon-purple" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{r.itemName}</div>
              <div className="text-xs text-white/45 mt-0.5">@{r.username} · #{r.ngId} · {r.price}₽ · {r.createdAt} назад</div>
            </div>
            {r.status === "pending" ? (
              <div className="flex gap-1.5 shrink-0">
                <button className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#34d399" }}>Одобрить</button>
                <button className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171" }}>Отклонить</button>
              </div>
            ) : (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ==== Broadcast ====

function BroadcastSection() {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [icon, setIcon] = useState("📢");
  const [sent, setSent] = useState(false);

  function send() {
    if (!title.trim()) return;
    setSent(true);
    setTimeout(() => setSent(false), 2000);
    setTitle(""); setSubtitle(""); setBody("");
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="glass rounded-2xl p-5 space-y-4">
        <h3 className="font-display font-bold text-sm flex items-center gap-2"><Megaphone size={16} className="text-neon-purple" /> Рассылка уведомления всем</h3>

        <div>
          <label className="text-xs text-white/55 mb-1.5 block">Иконка</label>
          <div className="flex gap-2 flex-wrap">
            {["📢", "⚠️", "🎉", "🔧", "💎", "🔒"].map((e) => (
              <button key={e} onClick={() => setIcon(e)} className={cn("h-9 w-9 rounded-xl text-lg transition", icon === e ? "btn-glow" : "glass")}>{e}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-white/55 mb-1.5 block">Заголовок</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} placeholder="Заголовок уведомления" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
        </div>
        <div>
          <label className="text-xs text-white/55 mb-1.5 block">Подзаголовок</label>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} placeholder="Краткое описание" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
        </div>
        <div>
          <label className="text-xs text-white/55 mb-1.5 block">Текст</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={3} placeholder="Полный текст уведомления…" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none resize-none focus:border-neon-purple/40" />
        </div>

        <button onClick={send} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2">
          {sent ? <><Check size={16} /> Отправлено!</> : <><Megaphone size={16} /> Отправить всем</>}
        </button>
      </div>
    </div>
  );
}

// ==== Log ====

function LogSection() {
  const logs = [
    { id: "l1", action: "Выдан бан", admin: "midnight", target: "spam_user", details: "7 дней · Спам", createdAt: "1 ч назад" },
    { id: "l2", action: "Выдан мут постов", admin: "midnight", target: "toxic_user", details: "3 дня · Оскорбления", createdAt: "2 ч назад" },
    { id: "l3", action: "Одобрена покупка", admin: "midnight", target: "user1", details: "Premium 1 месяц · 230₽", createdAt: "3 ч назад" },
    { id: "l4", action: "Смена роли", admin: "midnight", target: "user2", details: "user → support", createdAt: "5 ч назад" },
    { id: "l5", action: "Верификация", admin: "midnight", target: "creator1", details: "Подтверждён", createdAt: "1 д назад" },
  ];

  return (
    <div className="space-y-2">
      {logs.map((l) => (
        <div key={l.id} className="glass rounded-xl p-3 flex items-center gap-3">
          <ScrollText size={15} className="text-white/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm">{l.action}: <b>@{l.target}</b></div>
            <div className="text-xs text-white/40">{l.details} · @{l.admin} · {l.createdAt}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
