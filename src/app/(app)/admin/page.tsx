"use client";

// =============================================================================
//  NightGram Web — Admin Panel (real API, no demo data)
//  Tabs: Тикеты · Пользователи · Наказания · Жалобы · Финансы · Рассылка · Журнал
// =============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Ticket, Users, Gavel, Flag, DollarSign, Megaphone, ScrollText, ShoppingBag,
  Search, Ban, MicOff, AlertTriangle, Shield, Crown, ChevronLeft,
  Check, X, Loader2, UserCheck, Headphones, Star, Send, Image as ImageIcon, Plus, Sparkles, BarChart3, Trash2, Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { uploadMedia } from "@/lib/upload";
import { cn, timeAgo } from "@/lib/utils";
import { pushGlobalToast } from "@/lib/toast";
import { CustomSelect } from "@/components/shared/CustomSelect";
import { NAME_COLORS } from "@/lib/nameColors";

type Tab = "tickets" | "users" | "punishments" | "reports" | "finance" | "store" | "broadcast" | "safety" | "log";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "tickets", label: "Тикеты", icon: Ticket },
  { id: "users", label: "Пользователи", icon: Users },
  { id: "punishments", label: "Наказания", icon: Gavel },
  { id: "reports", label: "Жалобы", icon: Flag },
  { id: "finance", label: "Финансы", icon: DollarSign },
  { id: "store", label: "Магазин", icon: ShoppingBag },
  { id: "broadcast", label: "Рассылка", icon: Megaphone },
  { id: "safety", label: "Safety", icon: Shield },
  { id: "log", label: "Журнал", icon: ScrollText },
];

const ADMIN_ROLES = ["admin", "owner", "co_owner", "moderator", "support"];

export default function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("tickets");

  if (!user || !ADMIN_ROLES.includes(user.role)) {
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
    <div className="max-w-5xl mx-auto px-4 pb-12">
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

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-5">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm whitespace-nowrap transition",
                tab === t.id ? "bg-neon-purple/20 text-white border border-neon-purple/40 shadow-glow" : "glass text-white/55 hover:text-white")}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.2 }}>
          {tab === "tickets" && <TicketsSection />}
          {tab === "users" && <UsersSection />}
          {tab === "punishments" && <PunishmentsSection />}
          {tab === "reports" && <ReportsSection />}
          {tab === "finance" && <FinanceSection />}
          {tab === "store" && <StoreAdminSection />}
          {tab === "broadcast" && <BroadcastSection />}
          {tab === "safety" && <SafetySection />}
          {tab === "log" && <LogSection />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ==== Shared loading/empty ====

function LoadingState() {
  return <div className="text-center py-8 text-white/40"><Loader2 size={20} className="animate-spin mx-auto" /></div>;
}
function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="text-center py-12 text-white/40">
      <Icon size={32} className="mx-auto mb-3 opacity-50" />
      <p>{text}</p>
    </div>
  );
}

function withAdminTimeout<T>(promise: Promise<T>, fallback: T, timeout = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeout)),
  ]);
}

// ==== Tickets ====

function TicketsSection() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<Record<string, unknown>[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);

  const statusConfig: Record<string, { color: string; label: string }> = {
    open: { color: "#3b82f6", label: "Открыт" },
    in_progress: { color: "#fbbf24", label: "В работе" },
    resolved: { color: "#10b981", label: "Решён" },
    unresolved: { color: "#ef4444", label: "Не решён" },
    closed: { color: "#6b7280", label: "Закрыт" },
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadNotice(null);
    try {
      const data = await withAdminTimeout(api.getTickets(filter), [], 8000);
      const list = data as Record<string, unknown>[];
      setTickets(list);
      setActiveId((current) => {
        if (current && list.some((t) => String(t.id) === current)) return current;
        return list[0] ? String(list[0].id) : null;
      });
    } catch {
      setTickets([]);
      setActiveId(null);
      setLoadNotice("Не удалось загрузить тикеты. Проверь backend/Railway logs и роль модератора.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const filteredTickets = tickets.filter((ticket) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      ticket.subject,
      ticket.body,
      ticket.category,
      ticket.authorName,
      ticket.author_name,
      ticket.username,
      ticket.ngId,
      ticket.ng_id,
    ].map((v) => String(v ?? "").toLowerCase()).join(" ").includes(q);
  });

  const activeTicket = tickets.find((t) => String(t.id) === String(activeId)) ?? null;

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let active = true;
    setMessagesLoading(true);
    setReplyText("");
    api.getTicketMessages(activeId, true)
      .then((data) => active && setMessages(data as Record<string, unknown>[]))
      .catch(() => active && setMessages([]))
      .finally(() => active && setMessagesLoading(false));
    return () => { active = false; };
  }, [activeId]);

  async function updateStatus(id: string, status: string) {
    setUpdating(status);
    try {
      await api.updateTicket(id, { status });
      setTickets((prev) => prev.map((ticket) => String(ticket.id) === id ? { ...ticket, status } : ticket));
    } catch {
      /* keep UI stable */
    } finally {
      setUpdating(null);
    }
  }

  async function sendReply() {
    if (!activeId || !replyText.trim()) return;
    setReplying(true);
    try {
      const msg = await api.replyTicket(activeId, replyText.trim(), true);
      setMessages((prev) => [...prev, msg as Record<string, unknown>]);
      setReplyText("");
      setTickets((prev) => prev.map((ticket) => String(ticket.id) === activeId ? { ...ticket, status: "in_progress" } : ticket));
    } catch {
      /* keep reply text for retry */
    } finally {
      setReplying(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {["all", "open", "in_progress", "resolved", "unresolved", "closed"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition",
              filter === f ? "bg-neon-purple/20 text-white border border-neon-purple/40" : "glass text-white/55 hover:text-white")}>
            {f === "all" ? "Все" : statusConfig[f]?.label ?? f}
          </button>
        ))}
      </div>

      {loadNotice && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-xs text-amber-200">
          {loadNotice}
        </div>
      )}

      <div className="grid gap-4 h-[calc(100vh-16rem)] min-h-[560px] md:grid-cols-[340px_1fr]">
        {/* Left — ticket list */}
        <div className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${activeId ? "hidden md:flex" : "flex"} flex-col`}>
          <div className="p-4 border-b border-white/5">
            <div className="flex items-center gap-2 mb-3">
              <Ticket size={18} className="text-neon-purple" />
              <h2 className="font-display font-bold text-lg">Тикеты</h2>
              <span className="ml-auto rounded-full bg-neon-purple/10 px-2 py-0.5 text-[10px] text-neon-purple">{filteredTickets.length}</span>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по теме, юзеру, ID…"
                className="w-full rounded-xl glass pl-8 pr-3 py-2.5 text-sm outline-none focus:border-neon-purple/40"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <AdminTicketListSkeleton />
            ) : filteredTickets.length === 0 ? (
              <div className="h-full grid place-items-center text-center text-white/40 p-6">
                <div>
                  <Ticket size={34} className="mx-auto mb-3 text-neon-purple" />
                  <p className="text-sm">Тикетов нет</p>
                </div>
              </div>
            ) : filteredTickets.map((ticket) => (
              <AdminTicketRow
                key={String(ticket.id)}
                ticket={ticket}
                active={String(ticket.id) === String(activeId)}
                statusConfig={statusConfig}
                onClick={() => setActiveId(String(ticket.id))}
              />
            ))}
          </div>
        </div>

        {/* Right — ticket chat */}
        <div className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${!activeId ? "hidden md:flex" : "flex"} flex-col`}>
          {activeTicket ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 p-3 border-b border-white/5 glass-strong">
                <button onClick={() => setActiveId(null)} className="md:hidden grid place-items-center h-9 w-9 rounded-lg glass">
                  <ChevronLeft size={18} />
                </button>
                <div className="h-11 w-11 rounded-2xl grid place-items-center glass-strong shrink-0">
                  <Ticket size={20} className="text-neon-purple" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{String(activeTicket.subject ?? "Тикет")}</div>
                  <div className="text-xs text-white/45 truncate">
                    @{String(activeTicket.authorName ?? activeTicket.author_name ?? "user")} · {String(activeTicket.category ?? "Вопрос")}
                  </div>
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-bold shrink-0"
                  style={{
                    background: `${(statusConfig[String(activeTicket.status ?? "open")] ?? statusConfig.open).color}22`,
                    color: (statusConfig[String(activeTicket.status ?? "open")] ?? statusConfig.open).color,
                  }}
                >
                  {(statusConfig[String(activeTicket.status ?? "open")] ?? statusConfig.open).label}
                </span>
              </div>

              {/* Meta */}
              <div className="grid sm:grid-cols-3 gap-2 p-3 border-b border-white/5">
                <InfoPill label="Пользователь" value={`@${String(activeTicket.authorName ?? activeTicket.author_name ?? "")}`} />
                <InfoPill label="Категория" value={String(activeTicket.category ?? "Вопрос")} />
                <InfoPill label="Создан" value={timeAgo(String(activeTicket.createdAt ?? activeTicket.created_at ?? new Date().toISOString()))} />
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <AdminTicketBubble
                  mine={false}
                  label="Пользователь"
                  text={String(activeTicket.body ?? "") || String(activeTicket.subject ?? "")}
                  date={String(activeTicket.createdAt ?? activeTicket.created_at ?? new Date().toISOString())}
                />
                {messagesLoading ? (
                  <div className="py-8 text-center text-white/40"><Loader2 size={20} className="animate-spin mx-auto" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-white/35 text-sm py-8">Ответов пока нет</div>
                ) : messages.map((msg) => {
                  const role = String(msg.authorRole ?? msg.author_role ?? "user");
                  const support = role === "support" || role === "admin";
                  return (
                    <AdminTicketBubble
                      key={String(msg.id)}
                      mine={support}
                      label={support ? "Поддержка" : "Пользователь"}
                      text={String(msg.text ?? "")}
                      date={String(msg.createdAt ?? msg.created_at ?? new Date().toISOString())}
                    />
                  );
                })}
              </div>

              {/* Status actions + composer */}
              <div className="border-t border-white/5 glass-strong p-3 space-y-3">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                  {[
                    ["in_progress", "В работу"],
                    ["resolved", "Решено"],
                    ["unresolved", "Не решён"],
                    ["closed", "Закрыть"],
                  ].map(([status, label]) => (
                    <button
                      key={status}
                      onClick={() => updateStatus(String(activeTicket.id), status)}
                      disabled={updating === status}
                      className="rounded-lg glass px-3 py-1.5 text-xs text-white/60 hover:text-white disabled:opacity-50"
                    >
                      {updating === status ? "…" : label}
                    </button>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); sendReply(); }} className="flex items-center gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Ответить пользователю…"
                    className="flex-1 rounded-full glass px-4 py-2.5 text-sm outline-none focus:border-neon-purple/40"
                  />
                  <button type="submit" disabled={replying || !replyText.trim()} className="grid place-items-center h-10 w-10 rounded-full btn-glow disabled:opacity-40">
                    {replying ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full grid place-items-center text-center text-white/40 p-8">
              <div>
                <Ticket size={38} className="mx-auto mb-3 text-neon-purple" />
                <p>Выбери тикет</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminTicketRow({
  ticket,
  active,
  statusConfig,
  onClick,
}: {
  ticket: Record<string, unknown>;
  active: boolean;
  statusConfig: Record<string, { color: string; label: string }>;
  onClick: () => void;
}) {
  const status = String(ticket.status ?? "open");
  const cfg = statusConfig[status] ?? statusConfig.open;
  return (
    <motion.button
      layout
      whileHover={{ x: 2 }}
      onClick={onClick}
      className={cn("w-full flex items-center gap-3 rounded-2xl p-2.5 text-left transition relative", active ? "glass-strong shadow-glow" : "hover:bg-white/5")}
    >
      {active && <motion.span layoutId="admin-ticket-active" className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-neon-purple" style={{ boxShadow: "0 0 10px var(--accent-main)" }} />}
      <div className="h-12 w-12 rounded-2xl grid place-items-center glass shrink-0"><Ticket size={20} className="text-neon-purple" /></div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate text-sm">{String(ticket.subject ?? "Тикет")}</div>
        <div className="text-xs text-white/45 truncate">@{String(ticket.authorName ?? ticket.author_name ?? "user")} · {String(ticket.category ?? "")}</div>
      </div>
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>
    </motion.button>
  );
}

function AdminTicketBubble({ mine, label, text, date }: { mine: boolean; label: string; text: string; date: string }) {
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl glass px-3 py-2 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-white/30">{label}</div>
      <div className="text-xs text-white/70 truncate">{value}</div>
    </div>
  );
}

function AdminTicketListSkeleton() {
  return <div className="p-3 space-y-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex gap-3"><div className="skeleton h-12 w-12 rounded-2xl"/><div className="flex-1 space-y-2"><div className="skeleton h-4 w-32 rounded"/><div className="skeleton h-3 w-44 rounded"/></div></div>)}</div>;
}

// ==== Users ====

function UsersSection() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionUser, setActionUser] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await withAdminTimeout(api.getAdminUsers(search, 50), []); setUsers(data as Record<string, unknown>[]); } catch { setUsers([]); }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const roleColors: Record<string, string> = {
    owner: "#7c3aed", co_owner: "#a855f7", admin: "#ef4444", moderator: "#3b82f6", support: "#22d3ee", user: "#9ca3af", creator: "#ec4899",
  };
  const roleLabels: Record<string, string> = {
    owner: "Owner", co_owner: "Co-Owner", admin: "Admin", moderator: "Moderator", support: "Support", user: "User", creator: "Creator",
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по ID, нику или email…"
          className="w-full rounded-xl glass pl-9 pr-3 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
      </div>
      {loading ? <LoadingState /> : users.length === 0 ? <EmptyState icon={Users} text="Пользователи не найдены" /> : (
        users.map((u) => {
          const role = String(u.role ?? "user");
          return (
            <div key={String(u.id)} className="glass rounded-2xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl glass grid place-items-center shrink-0">
                <Users size={18} className="text-white/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm flex items-center gap-2">
                  @{String(u.username ?? "")}
                  {Boolean(u.isPremium) && <Crown size={13} style={{ color: "#fbbf24" }} />}
                  {Boolean(u.banned) && <Ban size={13} className="text-red-400" />}
                </div>
                <div className="text-xs text-white/45">#{String(u.ngId ?? u.ng_id ?? "")}</div>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${roleColors[role]}22`, color: roleColors[role] }}>
                {roleLabels[role] ?? role}
              </span>
              <button onClick={() => setActionUser(u)} className="btn-ghost px-3 py-1.5 text-xs shrink-0">Действия</button>
            </div>
          );
        })
      )}
      {actionUser && <UserActionModal user={actionUser} myRole={me?.role ?? "user"} onClose={() => { setActionUser(null); load(); }} />}
    </div>
  );
}

// ==== User Action Modal ====

function UserActionModal({ user, myRole, onClose }: { user: Record<string, unknown>; myRole: string; onClose: () => void }) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [customCoins, setCustomCoins] = useState(String(user.nightCoins ?? user.night_coins ?? ""));
  const [customBoosts, setCustomBoosts] = useState(String(user.boostBalance ?? user.boost_balance ?? ""));
  const [customPunishment, setCustomPunishment] = useState({ type: "ban", duration: "7d", reason: "Нарушение правил" });
  const [premiumDays, setPremiumDays] = useState("30");
  const [modalTab, setModalTab] = useState<"overview" | "profile" | "punish" | "grant">("overview");
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [profileDraft, setProfileDraft] = useState({
    username: String(user.username ?? ""),
    displayName: String(user.displayName ?? user.display_name ?? ""),
    bio: String(user.bio ?? ""),
    customId: String(user.customId ?? user.custom_id ?? ""),
    nameColor: String(user.nameColor ?? user.name_color ?? "#ffffff"),
    nameColorId: String(user.nameColorId ?? user.name_color_id ?? "light"),
    avatarFrame: String(user.avatarFrame ?? user.avatar_frame ?? ""),
    glowEffect: String(user.glowEffect ?? user.glow_effect ?? ""),
    avatarUrl: String(user.avatarUrl ?? user.avatar_url ?? ""),
    bannerUrl: String(user.bannerUrl ?? user.banner_url ?? ""),
    verified: Boolean(user.verified ?? user.avatarFrame === "verified" ?? false),
    hideSocial: Boolean(user.hideSocial ?? user.hide_social ?? false),
    hidePurchases: Boolean(user.hidePurchases ?? user.hide_purchases ?? false),
  });
  const userId = String(user.id);
  const username = String(user.username ?? "");
  const isOwner = myRole === "owner" || myRole === "co_owner";
  const isAdmin = ["admin", "owner", "co_owner"].includes(myRole);
  const canPunish = ["admin", "owner", "co_owner", "moderator", "support"].includes(myRole);

  async function doAction(action: string, fn: () => Promise<unknown>) {
    setProcessing(action);
    try {
      await fn();
      pushGlobalToast("Действие выполнено", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Действие не выполнено";
      pushGlobalToast(message, "error");
    }
    setProcessing(null);
  }

  useEffect(() => {
    let active = true;
    setDetailLoading(true);
    api.getAdminUserDetail(userId)
      .then((data) => {
        if (!active) return;
        const d = data as Record<string, unknown>;
        setDetail(d);
        const full = (d.user ?? {}) as Record<string, unknown>;
        setProfileDraft((prev) => ({
          ...prev,
          username: String(full.username ?? prev.username),
          displayName: String(full.displayName ?? full.display_name ?? prev.displayName),
          bio: String(full.bio ?? prev.bio),
          customId: String(full.customId ?? full.custom_id ?? prev.customId),
          nameColor: String(full.nameColor ?? full.name_color ?? prev.nameColor),
          nameColorId: String(full.nameColorId ?? full.name_color_id ?? prev.nameColorId),
          avatarFrame: String(full.avatarFrame ?? full.avatar_frame ?? prev.avatarFrame),
          glowEffect: String(full.glowEffect ?? full.glow_effect ?? prev.glowEffect),
          avatarUrl: String(full.avatarUrl ?? full.avatar_url ?? prev.avatarUrl),
          bannerUrl: String(full.bannerUrl ?? full.banner_url ?? prev.bannerUrl),
          verified: Boolean(full.verified ?? full.avatarFrame === "verified" ?? prev.verified),
          hideSocial: Boolean(full.hideSocial ?? full.hide_social ?? prev.hideSocial),
          hidePurchases: Boolean(full.hidePurchases ?? full.hide_purchases ?? prev.hidePurchases),
        }));
      })
      .catch(() => active && setDetail(null))
      .finally(() => active && setDetailLoading(false));
    return () => { active = false; };
  }, [userId]);

  async function punish(type: string, reason: string, duration: string) {
    await doAction(`punish_${type}`, async () => {
      const created = await api.createPunishment({ userId, type, reason, duration }) as Record<string, unknown>;
      setDetail((prev) => prev ? {
        ...prev,
        activePunishments: [created, ...((prev.activePunishments as Record<string, unknown>[] | undefined) ?? [])],
      } : prev);
    });
  }

  async function saveProfileDraft() {
    await doAction("profile_save", async () => {
      const updated = await api.updateAdminUserProfile(userId, {
        ...profileDraft,
        customId: profileDraft.customId.trim() || null,
        avatarFrame: profileDraft.avatarFrame.trim() || null,
        glowEffect: profileDraft.glowEffect.trim() || null,
        avatarUrl: profileDraft.avatarUrl.trim() || null,
        bannerUrl: profileDraft.bannerUrl.trim() || null,
      });
      setDetail((prev) => prev ? { ...prev, user: updated } : prev);
    });
  }

  async function resetCosmetics() {
    await doAction("reset_cosmetics", async () => {
      const updated = await api.resetAdminUserCosmetics(userId);
      setDetail((prev) => prev ? { ...prev, user: updated } : prev);
      setProfileDraft((prev) => ({ ...prev, nameColor: "#ffffff", avatarFrame: "", glowEffect: "" }));
    });
  }

  const detailStats = (detail?.stats ?? {}) as Record<string, unknown>;
  const activePunishments = (detail?.activePunishments ?? []) as Record<string, unknown>[];
  const recentPurchases = (detail?.recentPurchases ?? []) as Record<string, unknown>[];
  const safety = (detail?.safety ?? {}) as Record<string, unknown>;
  const trust = (safety.trust ?? {}) as Record<string, unknown>;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 w-full max-w-2xl ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-lg">@{username}</h3>
            <div className="text-xs text-white/40">#{String(user.ngId ?? user.ng_id ?? "")} · {String(user.email ?? "")}</div>
          </div>
          <button onClick={onClose} className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            ["overview", "Обзор"],
            ["profile", "Профиль"],
            ["punish", "Наказания"],
            ["grant", "Выдача"],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setModalTab(id)} className={modalTab === id ? "btn-glow px-3 py-2 text-xs" : "btn-ghost px-3 py-2 text-xs"}>{label}</button>
          ))}
        </div>

        {detailLoading ? (
          <div className="mb-4 rounded-3xl glass p-5 text-center text-white/40"><Loader2 size={18} className="animate-spin mx-auto" /></div>
        ) : (
          <>
            <div className={modalTab === "overview" ? "mb-4 grid grid-cols-2 gap-2 md:grid-cols-5" : "hidden"}>
              {[
                ["Посты", detailStats.posts],
                ["Комменты", detailStats.comments],
                ["Подписчики", detailStats.followers],
                ["Покупки", detailStats.purchases],
                ["Safety", trust.score ?? "—"],
                ["Предметы", detailStats.items],
                ["Чаты", detailStats.conversations],
                ["Тикеты", detailStats.tickets],
                ["Жалобы", detailStats.reportsMade],
                ["Наказания", activePunishments.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl glass px-3 py-2">
                  <div className="text-[10px] text-white/35">{String(label)}</div>
                  <div className="font-display text-lg font-bold text-white/85">{String(value ?? 0)}</div>
                </div>
              ))}
            </div>

            <div className={modalTab === "profile" ? "mb-4 rounded-3xl glass p-3" : "hidden"}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Профиль и косметика</div>
                  <div className="text-[11px] text-white/40">Редактирование публичного профиля, приватности, рамок и glow</div>
                </div>
                <span className="rounded-full bg-neon-purple/10 px-2 py-1 text-[10px] text-neon-purple">trust {String(trust.level ?? "auto")}</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <input value={profileDraft.username} onChange={(e) => setProfileDraft((p) => ({ ...p, username: e.target.value }))} placeholder="username" className="ng-input py-2.5 text-xs" />
                <input value={profileDraft.displayName} onChange={(e) => setProfileDraft((p) => ({ ...p, displayName: e.target.value }))} placeholder="display name" className="ng-input py-2.5 text-xs" />
                <input value={profileDraft.customId} onChange={(e) => setProfileDraft((p) => ({ ...p, customId: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} placeholder="custom ID" className="ng-input py-2.5 text-xs" />
                <CustomSelect
                  value={profileDraft.nameColor}
                  onChange={(value) => {
                    const preset = NAME_COLORS.find((color) => color.color === value);
                    setProfileDraft((p) => ({ ...p, nameColor: value, nameColorId: preset?.id ?? p.nameColorId }));
                  }}
                  buttonClassName="py-2.5 text-xs"
                  options={NAME_COLORS.map((preset) => ({ value: preset.color, label: `${preset.emoji} ${preset.label}`, description: preset.color }))}
                />
                <CustomSelect
                  value={profileDraft.avatarFrame || ""}
                  onChange={(value) => setProfileDraft((p) => ({ ...p, avatarFrame: value }))}
                  buttonClassName="py-2.5 text-xs"
                  options={[
                    { value: "", label: "Без рамки" },
                    { value: "gradient", label: "🌌 Aurora" },
                    { value: "rainbow", label: "🌈 Prism" },
                    { value: "premium", label: "👑 Gold Nova" },
                    { value: "dual:#a855f7:#ec4899", label: "💜 Violet Rose" },
                    { value: "dual:#22d3ee:#8b5cf6", label: "💎 Cyber Ice" },
                  ]}
                />
                <CustomSelect
                  value={profileDraft.glowEffect || ""}
                  onChange={(value) => setProfileDraft((p) => ({ ...p, glowEffect: value }))}
                  buttonClassName="py-2.5 text-xs"
                  options={[
                    { value: "", label: "Без glow" },
                    { value: "purple", label: "💜 Purple" },
                    { value: "pink", label: "💗 Pink" },
                    { value: "cyan", label: "💎 Cyan" },
                    { value: "gold", label: "✨ Gold" },
                  ]}
                />
                <input value={profileDraft.avatarUrl} onChange={(e) => setProfileDraft((p) => ({ ...p, avatarUrl: e.target.value }))} placeholder="avatar URL" className="ng-input py-2.5 text-xs" />
                <input value={profileDraft.bannerUrl} onChange={(e) => setProfileDraft((p) => ({ ...p, bannerUrl: e.target.value }))} placeholder="banner URL" className="ng-input py-2.5 text-xs" />
                <textarea value={profileDraft.bio} onChange={(e) => setProfileDraft((p) => ({ ...p, bio: e.target.value.slice(0, 300) }))} placeholder="bio" rows={3} className="ng-input resize-none py-2.5 text-xs md:col-span-2" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["verified", "Верифицирован"],
                  ["hideSocial", "Скрыть социальное"],
                  ["hidePurchases", "Скрыть покупки"],
                ].map(([key, label]) => (
                  <button key={key} onClick={() => setProfileDraft((p) => ({ ...p, [key]: !p[key as keyof typeof p] }))} className={profileDraft[key as keyof typeof profileDraft] ? "btn-glow px-3 py-2 text-xs" : "btn-ghost px-3 py-2 text-xs"}>{label}</button>
                ))}
                <button onClick={saveProfileDraft} disabled={processing === "profile_save"} className="btn-glow ml-auto px-4 py-2 text-xs">{processing === "profile_save" ? "…" : "Сохранить профиль"}</button>
                <button onClick={resetCosmetics} disabled={processing === "reset_cosmetics"} className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">Сброс косметики</button>
              </div>
            </div>

            {modalTab === "overview" && (activePunishments.length > 0 || recentPurchases.length > 0) && (
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl glass p-3">
                  <div className="mb-2 text-sm font-semibold">Активные наказания</div>
                  {activePunishments.length === 0 ? <div className="text-xs text-white/35">Нет активных</div> : activePunishments.map((p) => <div key={String(p.id)} className="rounded-2xl bg-white/[0.03] px-3 py-2 text-xs text-white/65">{String(p.type)} · {String(p.reason)} · {String(p.duration)}</div>)}
                </div>
                <div className="rounded-3xl glass p-3">
                  <div className="mb-2 text-sm font-semibold">Последние покупки</div>
                  {recentPurchases.length === 0 ? <div className="text-xs text-white/35">Пусто</div> : recentPurchases.slice(0, 5).map((p) => <div key={String(p.id)} className="rounded-2xl bg-white/[0.03] px-3 py-2 text-xs text-white/65">{String(p.itemName ?? p.item_name)} · {String(p.status)}</div>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* Punishments */}
        {canPunish && modalTab === "punish" && (
          <div className="space-y-2 mb-4">
            <p className="text-xs text-white/55 ml-1 mb-1">Наказания:</p>
            <PunishButton icon={Ban} color="#ef4444" label="Бан 7 дней" loading={processing === "punish_ban"}
              onClick={() => punish("ban", "Нарушение правил", "7d")} />
            <PunishButton icon={Ban} color="#ef4444" label="Бан навсегда" loading={processing === "punish_ban_perm"}
              onClick={() => punish("ban", "Серьёзное нарушение", "permanent")} />
            <PunishButton icon={MicOff} color="#f97316" label="Мут постов 3 дня" loading={processing === "punish_mute_posts"}
              onClick={() => punish("mute_posts", "Спам/оскорбления", "3d")} />
            <PunishButton icon={MicOff} color="#fbbf24" label="Мут ЛС 3 дня" loading={processing === "punish_mute_dm"}
              onClick={() => punish("mute_dm", "Нарушение в ЛС", "3d")} />
            <PunishButton icon={AlertTriangle} color="#3b82f6" label="Предупреждение" loading={processing === "punish_warning"}
              onClick={() => punish("warning", "Предупреждение", "—")} />
            <div className="mt-3 rounded-2xl glass p-3 space-y-2">
              <div className="text-xs text-white/55">Кастомное наказание</div>
              <div className="grid grid-cols-2 gap-2">
                <CustomSelect
                  value={customPunishment.type}
                  onChange={(value) => setCustomPunishment((p) => ({ ...p, type: value }))}
                  options={[
                    { value: "ban", label: "Бан" },
                    { value: "mute_dm", label: "Мут ЛС" },
                    { value: "mute_posts", label: "Мут постов" },
                    { value: "warning", label: "Предупреждение" },
                  ]}
                  buttonClassName="py-2.5 text-xs"
                />
                <input value={customPunishment.duration} onChange={(e) => setCustomPunishment((p) => ({ ...p, duration: e.target.value }))} placeholder="7d / 30d / permanent" className="ng-input py-2.5 text-xs" />
              </div>
              <input value={customPunishment.reason} onChange={(e) => setCustomPunishment((p) => ({ ...p, reason: e.target.value }))} placeholder="Причина" className="ng-input py-2.5 text-xs" />
              <button onClick={() => punish(customPunishment.type, customPunishment.reason, customPunishment.duration)} disabled={processing === `punish_${customPunishment.type}`} className="btn-ghost w-full py-2 text-xs">Выдать кастомно</button>
            </div>
          </div>
        )}

        {/* Verify */}
        {isAdmin && modalTab === "profile" && (
          <div className="mb-3 rounded-2xl glass p-3">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck size={15} className="text-neon-purple" />
              <div>
                <div className="text-sm font-semibold">Верификация</div>
                <div className="text-xs text-white/45">Галочка-значок: «Верифицирован — верифицированный пользователь NightGram»</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => doAction("verify", () => api.verifyUser(userId, true))}
                disabled={processing === "verify"}
                className="btn-ghost py-2.5 text-sm flex items-center justify-center gap-2">
                {processing === "verify" ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={15} />} Добавить
              </button>
              <button onClick={() => doAction("unverify", () => api.verifyUser(userId, false))}
                disabled={processing === "unverify"}
                className="rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm text-red-300 hover:bg-red-500/15 transition">
                {processing === "unverify" ? "…" : "Убрать"}
              </button>
            </div>
          </div>
        )}

        {/* Role change (owner only) */}
        {isOwner && modalTab === "profile" && (
          <div className="mb-4">
            <p className="text-xs text-white/55 ml-1 mb-2">Сменить роль:</p>
            <div className="grid grid-cols-2 gap-2">
              {(["user", "creator", "support", "moderator", "admin", "co_owner"]).map((r) => (
                <button key={r} onClick={() => doAction(`role_${r}`, () => api.changeRole(userId, r))}
                  disabled={processing === `role_${r}`}
                  className="rounded-lg px-3 py-2 text-xs font-medium glass hover:brightness-125 transition"
                  style={{ border: `1px solid ${roleColor(r)}40`, color: roleColor(r) }}>
                  {processing === `role_${r}` ? <Loader2 size={12} className="animate-spin mx-auto" /> : roleLabel(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Edit stats (admin+) */}
        {isAdmin && modalTab === "grant" && (
          <div className="mb-4 rounded-2xl glass p-3">
            <p className="text-xs text-white/55 ml-1 mb-2">Статистика и Premium:</p>
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <input value={customCoins} onChange={(e) => setCustomCoins(e.target.value.replace(/\D/g, ""))} placeholder="NightCoins" className="ng-input py-2.5 text-xs" />
              <button onClick={() => doAction("coins_custom", () => api.editUserStats(userId, { nightCoins: Number(customCoins || 0) }))}
                disabled={processing === "coins_custom"}
                className="btn-ghost px-3 py-2 text-xs">
                Сохранить ✦
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-3">
              <input value={customBoosts} onChange={(e) => setCustomBoosts(e.target.value.replace(/\D/g, ""))} placeholder="Бусты" className="ng-input py-2.5 text-xs" />
              <button onClick={() => doAction("boosts_custom", () => api.editUserStats(userId, { boostBalance: Number(customBoosts || 0) }))}
                disabled={processing === "boosts_custom"}
                className="btn-ghost px-3 py-2 text-xs">
                Сохранить бусты
              </button>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 mb-2">
              <input value={premiumDays} onChange={(e) => setPremiumDays(e.target.value.replace(/\D/g, ""))} placeholder="Дней Premium" className="ng-input py-2.5 text-xs" />
              <button onClick={() => doAction("premium", () => api.editUserStats(userId, { isPremium: true, premiumUntil: new Date(Date.now() + (Number(premiumDays || 30))*24*60*60*1000).toISOString(), boostBalance: Math.max(Number(customBoosts || 0), Number(premiumDays || 30) >= 730 ? 9 : Number(premiumDays || 30) >= 365 ? 6 : 3) }))}
                disabled={processing === "premium"}
                className="btn-ghost px-3 py-2 text-xs">
                Выдать Premium
              </button>
            </div>
            <button onClick={() => doAction("premium_remove", () => api.editUserStats(userId, { isPremium: false, premiumUntil: null }))}
              disabled={processing === "premium_remove"}
              className="w-full rounded-lg px-3 py-2 text-xs bg-red-500/10 border border-red-500/25 text-red-300 hover:bg-red-500/15">
              Убрать Premium
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function roleColor(r: string): string {
  const m: Record<string, string> = { owner: "#7c3aed", co_owner: "#a855f7", admin: "#ef4444", moderator: "#3b82f6", support: "#22d3ee", user: "#9ca3af", creator: "#ec4899" };
  return m[r] ?? "#9ca3af";
}
function roleLabel(r: string): string {
  const m: Record<string, string> = { owner: "Owner", co_owner: "Co-Owner", admin: "Admin", moderator: "Moderator", support: "Support", user: "User", creator: "Creator" };
  return m[r] ?? r;
}

function PunishButton({ icon: Icon, color, label, loading, onClick }: { icon: LucideIcon; color: string; label: string; loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition hover:brightness-125"
      style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}>
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />} {label}
    </button>
  );
}

// ==== Punishments ====

function PunishmentsSection() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await withAdminTimeout(api.getPunishments(), []); setList(data as Record<string, unknown>[]); } catch { setList([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revoke(id: string) {
    setRevoking(id);
    try { await api.revokePunishment(id); } catch {}
    setRevoking(null);
    load();
  }

  const typeConfig: Record<string, { icon: LucideIcon; color: string; label: string }> = {
    ban: { icon: Ban, color: "#ef4444", label: "Бан" },
    mute_dm: { icon: MicOff, color: "#fbbf24", label: "Мут ЛС" },
    mute_posts: { icon: MicOff, color: "#f97316", label: "Мут постов" },
    warning: { icon: AlertTriangle, color: "#3b82f6", label: "Предупреждение" },
  };

  if (loading) return <LoadingState />;
  if (list.length === 0) return <EmptyState icon={Gavel} text="Нет активных наказаний" />;

  return (
    <div className="space-y-3">
      {list.map((p) => {
        const type = String(p.type ?? "warning");
        const cfg = typeConfig[type] ?? typeConfig.warning;
        const Icon = cfg.icon;
        return (
          <div key={String(p.id)} className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: `${cfg.color}22` }}>
              <Icon size={18} style={{ color: cfg.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{String(p.reason ?? "")}</div>
              <div className="text-xs text-white/45 mt-0.5">
                {String(p.duration ?? "")} · выдал @{String(p.issuedByName ?? p.issued_by_name ?? "")} · {timeAgo(String(p.createdAt ?? p.created_at ?? new Date().toISOString()))}
              </div>
            </div>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>
            <button onClick={() => revoke(String(p.id))} disabled={revoking === String(p.id)}
              className="btn-ghost px-3 py-1.5 text-xs shrink-0">
              {revoking === String(p.id) ? <Loader2 size={12} className="animate-spin" /> : "Снять"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ==== Reports ====

function ReportsSection() {
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [filter, setFilter] = useState("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);
  const [noteText, setNoteText] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [punishment, setPunishment] = useState({ type: "none", duration: "7d", reason: "Нарушение правил" });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const catLabels: Record<string, string> = {
    spam: "Спам", scam: "Мошенничество", harassment: "Травля", nsfw: "18+", violence: "Насилие", copyright: "Авторские права", other: "Другое",
  };
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: "Новая", color: "#fbbf24" },
    actioned: { label: "Принята", color: "#34d399" },
    reviewed: { label: "Закрыта", color: "#9ca3af" },
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await withAdminTimeout(api.getReports(filter), [], 8000);
      const reports = data as Record<string, unknown>[];
      setList(reports);
      setActiveId((current) => current && reports.some((r) => String(r.id) === current) ? current : (reports[0] ? String(reports[0].id) : null));
    } catch {
      setList([]);
      setActiveId(null);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const activeReport = activeId ? list.find((r) => String(r.id) === activeId) ?? null : null;
  const activeType = String(activeReport?.targetType ?? activeReport?.target_type ?? "");

  useEffect(() => {
    setNotes([]);
    setNoteText("");
    setResolutionNote(String(activeReport?.resolutionNote ?? activeReport?.resolution_note ?? ""));
    setPunishment({ type: "none", duration: "7d", reason: activeReport ? `Жалоба: ${String(activeReport.category ?? "other")}` : "Нарушение правил" });
    if (!activeReport) return;
    const target = (activeReport.target ?? {}) as Record<string, unknown>;
    if (activeType === "post" || activeType === "comment") setEditDraft({ text: String(target.text ?? "") });
    else if (activeType === "channel") setEditDraft({ name: String(target.name ?? ""), description: String(target.description ?? "") });
    else if (activeType === "user") setEditDraft({ displayName: String(target.displayName ?? target.display_name ?? ""), bio: String(target.bio ?? "") });
    else setEditDraft({});
    api.getReportNotes(String(activeReport.id)).then((data) => setNotes(data as Record<string, unknown>[])).catch(() => setNotes([]));
  }, [activeId, activeReport, activeType]);

  function targetTitle(report: Record<string, unknown>) {
    const target = (report.target ?? {}) as Record<string, unknown>;
    const type = String(report.targetType ?? report.target_type ?? "");
    if (type === "user") return `@${String(target.username ?? "user")}`;
    if (type === "channel") return `Канал @${String(target.handle ?? "channel")}`;
    if (type === "post") return `Пост ${String(target.id ?? report.targetId ?? "").slice(0, 8)}`;
    if (type === "comment") return `Комментарий ${String(target.id ?? report.targetId ?? "").slice(0, 8)}`;
    return `${type || "target"}:${String(report.targetId ?? report.target_id ?? "").slice(0, 8)}`;
  }

  async function sendNote() {
    if (!activeReport || !noteText.trim()) return;
    setProcessing("note");
    try {
      const note = await api.addReportNote(String(activeReport.id), noteText.trim());
      setNotes((prev) => [...prev, note as Record<string, unknown>]);
      setNoteText("");
    } catch {}
    setProcessing(null);
  }

  async function saveTarget() {
    if (!activeReport) return;
    setProcessing("target");
    try {
      const res = await api.updateReportTarget(String(activeReport.id), editDraft) as Record<string, unknown>;
      setList((prev) => prev.map((r) => String(r.id) === String(activeReport.id) ? { ...r, target: res.target ?? r.target } : r));
    } catch {}
    setProcessing(null);
  }

  async function action(act: "reviewed" | "actioned") {
    if (!activeReport) return;
    setProcessing(act);
    try {
      await api.actionReport(String(activeReport.id), act, {
        note: resolutionNote,
        punishment: punishment.type !== "none" && act === "actioned" ? punishment : undefined,
      });
      await load();
    } catch {}
    setProcessing(null);
  }

  if (loading) return <LoadingState />;
  if (list.length === 0) return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {["all", "pending", "actioned", "reviewed"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition", filter === f ? "bg-neon-purple/20 text-white border border-neon-purple/40" : "glass text-white/55")}>{f === "all" ? "Все" : statusConfig[f]?.label ?? f}</button>
        ))}
      </div>
      <EmptyState icon={Flag} text="Нет жалоб" />
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.35fr]">
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {["all", "pending", "actioned", "reviewed"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition", filter === f ? "bg-neon-purple/20 text-white border border-neon-purple/40" : "glass text-white/55")}>{f === "all" ? "Все" : statusConfig[f]?.label ?? f}</button>
          ))}
        </div>
        <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {list.map((r) => {
            const status = String(r.status ?? "pending");
            const cfg = statusConfig[status] ?? statusConfig.pending;
            const active = String(r.id) === activeId;
            return (
              <button key={String(r.id)} onClick={() => setActiveId(String(r.id))} className={cn("relative w-full rounded-2xl p-3 text-left transition", active ? "glass-strong border border-neon-purple/35 shadow-glow" : "glass hover:brightness-110")}>
                <div className="flex items-center gap-2">
                  <Flag size={15} className="text-red-400 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{catLabels[String(r.category ?? "")] ?? String(r.category ?? "")}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>
                </div>
                <div className="mt-1 truncate text-xs text-white/55">{targetTitle(r)}</div>
                <div className="mt-1 line-clamp-2 text-xs text-white/38">{String(r.reason ?? "Без описания")}</div>
                <div className="mt-1 text-[10px] text-white/30">@{String(r.reporterName ?? r.reporter_name ?? "")} · {timeAgo(String(r.createdAt ?? r.created_at ?? new Date().toISOString()))}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ng-solid rounded-4xl p-5 shadow-glow-lg min-h-[520px]">
        {!activeReport ? <EmptyState icon={Flag} text="Выбери жалобу" /> : (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-red-500/10 text-red-300"><Flag size={19} /></div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl font-bold">{catLabels[String(activeReport.category ?? "")] ?? String(activeReport.category ?? "")}</div>
                <div className="text-xs text-white/45">Цель: {targetTitle(activeReport)} · reporter @{String(activeReport.reporterName ?? activeReport.reporter_name ?? "")}</div>
              </div>
              <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/45">{String(activeReport.status ?? "pending")}</span>
            </div>

            <div className="rounded-3xl glass p-4">
              <div className="mb-1 text-xs uppercase tracking-wide text-white/35">Причина</div>
              <div className="text-sm text-white/80 whitespace-pre-wrap">{String(activeReport.reason ?? "Без описания")}</div>
            </div>

            <div className="rounded-3xl glass p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm">Инлайн-редактор цели</div>
                <span className="text-[11px] text-white/35">{activeType || "unknown"}</span>
              </div>
              {(activeType === "post" || activeType === "comment") && (
                <textarea value={editDraft.text ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, text: e.target.value }))} rows={4} className="ng-input resize-none" placeholder="Текст цели" />
              )}
              {activeType === "channel" && (
                <div className="grid gap-2">
                  <input value={editDraft.name ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))} className="ng-input" placeholder="Название канала" />
                  <textarea value={editDraft.description ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} rows={3} className="ng-input resize-none" placeholder="Описание канала" />
                </div>
              )}
              {activeType === "user" && (
                <div className="grid gap-2">
                  <input value={editDraft.displayName ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, displayName: e.target.value }))} className="ng-input" placeholder="Display name" />
                  <textarea value={editDraft.bio ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, bio: e.target.value }))} rows={3} className="ng-input resize-none" placeholder="Bio" />
                </div>
              )}
              {!['post','comment','channel','user'].includes(activeType) && <div className="rounded-2xl bg-white/[0.03] p-3 text-xs text-white/40">Для этой цели доступен только аудит/наказание.</div>}
              <button onClick={saveTarget} disabled={processing === "target"} className="btn-ghost w-full py-2.5 text-sm">{processing === "target" ? "Сохраняем…" : "Сохранить правку цели"}</button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-3xl glass p-4 space-y-2">
                <div className="font-semibold text-sm">Решение</div>
                <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} rows={3} className="ng-input resize-none" placeholder="Комментарий к решению для аудита…" />
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => action("actioned")} disabled={Boolean(processing)} className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 py-2.5 text-sm text-emerald-300">Принять</button>
                  <button onClick={() => action("reviewed")} disabled={Boolean(processing)} className="rounded-xl bg-white/5 border border-white/10 py-2.5 text-sm text-white/65">Закрыть</button>
                </div>
              </div>

              <div className="rounded-3xl glass p-4 space-y-2">
                <div className="font-semibold text-sm">Наказание по жалобе</div>
                <div className="grid grid-cols-2 gap-2">
                  <CustomSelect
                    value={punishment.type}
                    onChange={(value) => setPunishment((p) => ({ ...p, type: value }))}
                    options={[
                      { value: "none", label: "Без наказания" },
                      { value: "warning", label: "Предупреждение" },
                      { value: "mute_posts", label: "Мут постов" },
                      { value: "mute_dm", label: "Мут ЛС" },
                      { value: "ban", label: "Бан" },
                    ]}
                    buttonClassName="py-2.5 text-xs"
                  />
                  <input value={punishment.duration} onChange={(e) => setPunishment((p) => ({ ...p, duration: e.target.value }))} className="ng-input py-2.5 text-xs" placeholder="3d / 30d / permanent" />
                </div>
                <input value={punishment.reason} onChange={(e) => setPunishment((p) => ({ ...p, reason: e.target.value }))} className="ng-input py-2.5 text-xs" placeholder="Причина наказания" />
                <div className="text-[11px] text-white/35">Наказание выдаётся владельцу цели: автору поста/коммента, владельцу канала или пользователю.</div>
              </div>
            </div>

            <div className="rounded-3xl glass p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold text-sm">Заметки штаба</div>
                <span className="text-[11px] text-white/35">audit trail</span>
              </div>
              <div className="mb-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                {notes.length === 0 ? <div className="py-3 text-center text-xs text-white/35">Заметок пока нет</div> : notes.map((n) => (
                  <div key={String(n.id)} className="rounded-2xl bg-white/[0.03] px-3 py-2">
                    <div className="text-xs text-white/75">{String(n.body ?? "")}</div>
                    <div className="mt-1 text-[10px] text-white/30">@{String(n.authorName ?? n.author_name ?? "staff")} · {timeAgo(String(n.createdAt ?? n.created_at ?? new Date().toISOString()))}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={noteText} onChange={(e) => setNoteText(e.target.value)} className="ng-input flex-1 py-2.5 text-sm" placeholder="Внутренняя заметка…" />
                <button onClick={sendNote} disabled={processing === "note" || !noteText.trim()} className="btn-glow px-4 text-sm disabled:opacity-50">Добавить</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ==== Finance ====

function FinanceSection() {
  const [filter, setFilter] = useState("all");
  const [requests, setRequests] = useState<Record<string, unknown>[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, events] = await Promise.race([
        Promise.all([api.getPurchaseRequests(filter), api.getPaymentEvents(filter === "all" ? undefined : filter)]),
        new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 3000)),
      ]);
      setRequests(data as Record<string, unknown>[]);
      setPaymentEvents(events as Record<string, unknown>[]);
    } catch {
      setRequests([]);
      setPaymentEvents([]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) { setProcessing(id); try { await api.approvePurchase(id); pushGlobalToast("Покупка выдана", "success"); } catch (error) { pushGlobalToast(error instanceof Error ? error.message : "Покупка не выдана", "error"); } setProcessing(null); load(); }
  async function regrant(id: string) { setProcessing(`regrant_${id}`); try { await api.regrantPurchase(id); pushGlobalToast("Покупка выдана повторно", "success"); } catch (error) { pushGlobalToast(error instanceof Error ? error.message : "Не удалось выдать повторно", "error"); } setProcessing(null); load(); }
  async function reject(id: string) { setProcessing(id); try { await api.rejectPurchase(id); pushGlobalToast("Заявка отклонена", "success"); } catch (error) { pushGlobalToast(error instanceof Error ? error.message : "Не удалось отклонить", "error"); } setProcessing(null); load(); }

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: "#fbbf24", label: "Ожидание" },
    approved: { color: "#10b981", label: "Одобрено" },
    rejected: { color: "#ef4444", label: "Отклонено" },
    amount_mismatch: { color: "#f97316", label: "Сумма не совпала" },
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white/45 ml-1">Заявки на покупку — подтвердите оплату для активации</p>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {["all", "pending", "approved", "rejected"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition",
              filter === f ? "bg-neon-purple/20 text-white border border-neon-purple/40" : "glass text-white/55")}>
            {f === "all" ? "Все" : statusConfig[f]?.label ?? f}
          </button>
        ))}
      </div>
      {loading ? <LoadingState /> : requests.length === 0 ? <EmptyState icon={DollarSign} text="Заявок нет" /> : (
        requests.map((r) => {
          const status = String(r.status ?? "pending");
          const cfg = statusConfig[status] ?? statusConfig.pending;
          return (
            <div key={String(r.id)} className="glass rounded-2xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl grid place-items-center shrink-0" style={{ background: String(r.itemType ?? r.item_type) === "premium" ? "rgba(251,191,36,0.12)" : "rgba(168,85,247,0.12)" }}>
                {String(r.itemType ?? r.item_type) === "premium" ? <Crown size={18} style={{ color: "#fbbf24" }} /> : <DollarSign size={18} className="text-neon-purple" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{String(r.itemName ?? r.item_name ?? "")}</div>
                <div className="text-xs text-white/45 mt-0.5">@{String(r.username ?? "")} · #{String(r.ngId ?? r.ng_id ?? "")} · {String(r.price ?? "")}₽</div>
                {Boolean(r.recipientUsername || r.recipient_username) && (
                  <div className="text-[11px] text-neon-gold mt-0.5">🎁 подарок для @{String(r.recipientUsername ?? r.recipient_username)}</div>
                )}
                {Boolean(r.paymentCode || r.payment_code || r.provider) && (
                  <div className="text-[11px] text-white/35 mt-0.5">
                    {String(r.paymentCode ?? r.payment_code ?? "")} {r.provider ? `· ${String(r.provider)}` : ""} {r.paidAmount || r.paid_amount ? `· оплачено ${String(r.paidAmount ?? r.paid_amount)}₽` : ""}
                  </div>
                )}
              </div>
              {status === "pending" ? (
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => approve(String(r.id))} disabled={processing === String(r.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#34d399" }}>
                    {processing === String(r.id) ? <Loader2 size={12} className="animate-spin" /> : "Одобрить"}
                  </button>
                  <button onClick={() => reject(String(r.id))} disabled={processing === String(r.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171" }}>
                    Отклонить
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>
                  {status === "approved" && (
                    <button onClick={() => regrant(String(r.id))} disabled={processing === `regrant_${String(r.id)}`} className="btn-ghost px-2 py-1.5 text-[10px]">
                      {processing === `regrant_${String(r.id)}` ? "…" : "Выдать ещё"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {!loading && paymentEvents.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="text-sm font-semibold text-white/70 ml-1">Платежи на ручную проверку</div>
          {paymentEvents.map((event) => (
            <div key={String(event.id)} className="glass rounded-2xl p-4 flex items-center gap-3 border border-amber-400/20">
              <DollarSign size={18} className="text-amber-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{String(event.amount ?? 0)} {String(event.currency ?? "RUB")}</div>
                <div className="text-xs text-white/45 truncate">{String(event.provider ?? "")} · @{String(event.username ?? "")}</div>
                <div className="text-[11px] text-white/35 truncate">{String(event.message ?? "без комментария")}</div>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-400/10 text-amber-300">
                {String(event.status ?? "unmatched")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ==== Store Items ====

function StoreAdminSection() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await withAdminTimeout(api.getStoreItems(), []);
      setItems(data as unknown as Record<string, unknown>[]);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingItem(null);
    setEditorOpen(true);
  }

  function openEdit(item: Record<string, unknown>) {
    setEditingItem(item);
    setEditorOpen(true);
  }

  async function removeItem(id: string) {
    try {
      await api.deleteStoreItem(id);
      setItems((prev) => prev.filter((item) => String(item.id) !== id));
    } catch {
      // keep stable
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-strong rounded-3xl p-4 flex items-center gap-3">
        <ShoppingBag size={20} className="text-neon-purple" />
        <div className="flex-1">
          <div className="font-semibold text-sm">Магазин</div>
          <div className="text-xs text-white/45">Создание и редактирование товаров</div>
        </div>
        <button onClick={openCreate} className="btn-glow px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={15} /> Добавить товар
        </button>
      </div>

      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={ShoppingBag} text="Товаров пока нет" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={String(item.id)} className="glass rounded-3xl p-3 space-y-3">
              <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-white/5">
                {String(item.previewUrl ?? "") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={String(item.previewUrl)} alt="" className="h-full w-full object-cover" />
                ) : <div className="grid h-full place-items-center text-white/30"><ShoppingBag size={24} /></div>}
              </div>
              <div>
                <div className="font-semibold text-sm truncate">{String(item.name ?? "")}</div>
                <div className="text-xs text-white/45 line-clamp-2">{String(item.description ?? "")}</div>
                <div className="mt-1 text-[11px] text-white/35">{String(item.category ?? "")} · {String(item.rarity ?? "")} · {String(item.priceCoins ?? item.price_coins ?? 0)}✦</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(item)} className="btn-ghost flex-1 py-2 text-xs">Редактировать</button>
                <button onClick={() => removeItem(String(item.id))} className="rounded-xl bg-red-500/10 border border-red-500/25 px-3 py-2 text-xs text-red-300 hover:bg-red-500/15">
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <StoreItemEditor
        open={editorOpen}
        item={editingItem}
        onClose={() => setEditorOpen(false)}
        onSaved={(saved) => {
          setItems((prev) => {
            const exists = prev.some((item) => String(item.id) === String(saved.id));
            return exists ? prev.map((item) => String(item.id) === String(saved.id) ? saved as unknown as Record<string, unknown> : item) : [saved as unknown as Record<string, unknown>, ...prev];
          });
          setEditorOpen(false);
        }}
      />
    </div>
  );
}

function parseStoreItemPayload(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function storePayloadLines(raw: unknown): string {
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : String(raw).split(/[\n,]+/);
  return list
    .map((entry) => {
      if (!entry) return "";
      if (typeof entry === "string") return entry.trim();
      if (typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        const url = String(obj.url ?? obj.modelUrl ?? obj.model_url ?? obj.previewUrl ?? obj.preview_url ?? "").trim();
        const name = String(obj.name ?? obj.title ?? "").trim();
        return name && url ? `${name}|${url}` : url || name;
      }
      return String(entry).trim();
    })
    .filter(Boolean)
    .join("\n");
}

function linesToList(value: string): string[] {
  return value.split(/[\n,]+/).map((line) => line.trim()).filter(Boolean);
}

function StoreItemEditor({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (item: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({ name: "", description: "", category: "theme", previewUrl: "", priceCoins: "150", rarity: "common", effectType: "theme", effectValue: "", effectPayload: "{}", upgradeable: false, maxLevel: "2", nftCollection: "", upgradePriceCoins: "150", nftModelsText: "", nftColorsText: "Фиолетовый\nЦиан\nЗолото", dropStartsAt: "", dropEndsAt: "", stockTotal: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const rawPayload = item?.effectPayload ?? item?.effect_payload ?? {};
    const parsedPayload = parseStoreItemPayload(rawPayload);
    const category = String(item?.category ?? "theme");
    setForm({
      name: String(item?.name ?? ""),
      description: String(item?.description ?? ""),
      category,
      previewUrl: String(item?.previewUrl ?? item?.preview_url ?? ""),
      priceCoins: String(item?.priceCoins ?? item?.price_coins ?? "150"),
      rarity: String(item?.rarity ?? "common"),
      effectType: String(item?.effectType ?? item?.effect_type ?? category),
      effectValue: String(item?.effectValue ?? item?.effect_value ?? ""),
      effectPayload: JSON.stringify(parsedPayload, null, 2),
      upgradeable: Boolean(item?.upgradeable ?? false),
      maxLevel: String(category === "nft" ? 2 : (item?.maxLevel ?? item?.max_level ?? "1")),
      nftCollection: String(item?.nftCollection ?? item?.nft_collection ?? ""),
      upgradePriceCoins: String(item?.upgradePriceCoins ?? parsedPayload.upgradePriceCoins ?? parsedPayload.upgradeCostBase ?? "150"),
      nftModelsText: storePayloadLines(parsedPayload.nftModels ?? parsedPayload.nft_models ?? parsedPayload.models ?? parsedPayload.modelUrls),
      nftColorsText: storePayloadLines(parsedPayload.nftColors ?? parsedPayload.nft_colors ?? parsedPayload.backgroundColors ?? parsedPayload.colors) || "Фиолетовый\nЦиан\nЗолото",
      dropStartsAt: String(item?.dropStartsAt ?? item?.drop_starts_at ?? "").slice(0, 16),
      dropEndsAt: String(item?.dropEndsAt ?? item?.drop_ends_at ?? "").slice(0, 16),
      stockTotal: item?.stockTotal !== undefined || item?.stock_total !== undefined ? String(item?.stockTotal ?? item?.stock_total ?? "") : "",
    });
  }, [item, open]);

  async function pickPreview(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadMedia(file, "posts");
      setForm((f) => ({ ...f, previewUrl: url }));
    } catch {
      // URL field remains usable
    }
    setUploading(false);
  }

  async function pickNftModel(file?: File) {
    if (!file) return;
    setUploadingModel(true);
    try {
      const url = await uploadMedia(file, "posts");
      const cleanName = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || "Model";
      setForm((f) => ({ ...f, nftModelsText: [f.nftModelsText.trim(), `${cleanName}|${url}`].filter(Boolean).join("\n") }));
    } catch {
      // Manual URL list remains usable
    }
    setUploadingModel(false);
  }

  async function save() {
    if (!form.name.trim() || !form.previewUrl.trim()) return;
    setSaving(true);
    try {
      let effectPayload: Record<string, unknown> = {};
      try { effectPayload = JSON.parse(form.effectPayload || "{}"); } catch { effectPayload = {}; }
      if (form.category === "nft" || form.effectType === "nft") {
        effectPayload.upgradePriceCoins = Math.max(1, Number(form.upgradePriceCoins) || 1);
        effectPayload.nftModels = linesToList(form.nftModelsText);
        effectPayload.nftColors = linesToList(form.nftColorsText);
      }
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category as any,
        previewUrl: form.previewUrl.trim(),
        priceCoins: Number(form.priceCoins) || 0,
        rarity: form.rarity as any,
        effectType: (form.category === "nft" ? "nft" : form.effectType) as any,
        effectValue: form.effectValue.trim() || null,
        effectPayload,
        upgradeable: form.category === "nft" ? form.upgradeable : form.upgradeable,
        maxLevel: form.category === "nft" ? 2 : (Number(form.maxLevel) || 1),
        upgradePriceCoins: form.category === "nft" ? Math.max(1, Number(form.upgradePriceCoins) || 1) : undefined,
        nftModels: form.category === "nft" ? linesToList(form.nftModelsText) : undefined,
        nftColors: form.category === "nft" ? linesToList(form.nftColorsText) : undefined,
        nftCollection: form.nftCollection.trim() || null,
        dropStartsAt: form.dropStartsAt ? new Date(form.dropStartsAt).toISOString() : null,
        dropEndsAt: form.dropEndsAt ? new Date(form.dropEndsAt).toISOString() : null,
        stockTotal: form.stockTotal ? Number(form.stockTotal) : null,
      };
      const saved = item?.id ? await api.updateStoreItem(String(item.id), payload) : await api.createStoreItem(payload);
      onSaved(saved as unknown as Record<string, unknown>);
    } catch {
      // keep editor open
    }
    setSaving(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto p-4 py-6 sm:py-8">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.94 }} className="relative z-10 w-full max-w-2xl ng-solid rounded-4xl p-5 shadow-glow-lg max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
            <h3 className="font-display font-bold text-xl mb-1">{item?.id ? "Редактор товара" : "Новый товар"}</h3>
            <p className="text-xs text-white/45 mb-4">Загрузи preview файлом или вставь URL. После сохранения товар появится в магазине.</p>

            <div className="grid md:grid-cols-[220px_1fr] gap-4">
              <div>
                <div className="aspect-[4/3] rounded-3xl overflow-hidden glass grid place-items-center">
                  {form.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.previewUrl} alt="preview" className="h-full w-full object-cover" />
                  ) : <ShoppingBag size={30} className="text-white/25" />}
                </div>
                <input ref={inputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pickPreview(e.target.files?.[0])} />
                <button onClick={() => inputRef.current?.click()} className="btn-ghost w-full mt-3 py-2.5 text-sm flex items-center justify-center gap-2">
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImageIcon size={15} />} Загрузить preview
                </button>
              </div>

              <div className="space-y-3">
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Название" className="ng-input" />
                <input value={form.previewUrl} onChange={(e) => setForm((f) => ({ ...f, previewUrl: e.target.value }))} placeholder="Preview URL" className="ng-input" />
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Описание" rows={3} className="ng-input resize-none" />
                <div className="grid sm:grid-cols-3 gap-2">
                  <CustomSelect
                    value={form.category}
                    onChange={(value) => setForm((f) => ({ ...f, category: value, effectType: value === "nft" ? "nft" : f.effectType, maxLevel: value === "nft" ? "2" : f.maxLevel }))}
                    options={[
                      { value: "theme", label: "Тема" },
                      { value: "color_pack", label: "Цвета" },
                      { value: "sticker_pack", label: "Стикеры" },
                      { value: "frame", label: "Рамка" },
                      { value: "glow_effect", label: "Glow" },
                      { value: "badge", label: "Бейдж" },
                      { value: "nft", label: "NFT" },
                    ]}
                  />
                  <CustomSelect
                    value={form.rarity}
                    onChange={(value) => setForm((f) => ({ ...f, rarity: value }))}
                    options={[
                      { value: "common", label: "Common" },
                      { value: "rare", label: "Rare" },
                      { value: "epic", label: "Epic" },
                      { value: "legendary", label: "Legendary" },
                    ]}
                  />
                  <input value={form.priceCoins} onChange={(e) => setForm((f) => ({ ...f, priceCoins: e.target.value.replace(/\D/g, "") }))} placeholder="Цена" className="ng-input text-sm" />
                </div>
                <div className="rounded-3xl glass p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-neon-purple"><Wand2 size={13} /> Как товар используется</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <CustomSelect
                      value={form.effectType}
                      onChange={(value) => setForm((f) => ({ ...f, effectType: value }))}
                      options={[
                        { value: "theme", label: "Тема сайта" },
                        { value: "accent", label: "Акцент сайта" },
                        { value: "profile_background", label: "Фон профиля" },
                        { value: "badge", label: "Бейдж" },
                        { value: "avatar_frame", label: "Рамка аватара" },
                        { value: "name_color", label: "Цвет имени" },
                        { value: "glow_effect", label: "Glow" },
                        { value: "sticker_pack", label: "Стикер-пак" },
                        { value: "nft", label: "NFT / улучшаемый предмет" },
                      ]}
                      buttonClassName="text-xs"
                    />
                    <input value={form.effectValue} onChange={(e) => setForm((f) => ({ ...f, effectValue: e.target.value }))} placeholder="effect value: #hex / frame / theme id" className="ng-input py-2.5 text-xs" />
                  </div>
                  <textarea value={form.effectPayload} onChange={(e) => setForm((f) => ({ ...f, effectPayload: e.target.value }))} rows={3} placeholder='JSON доп. бонусов, например {"auraBonus":12}' className="ng-input resize-none py-2.5 text-xs font-mono" />
                  <div className="grid sm:grid-cols-[1fr_90px_1fr] gap-2">
                    <button onClick={() => setForm((f) => ({ ...f, upgradeable: !f.upgradeable }))} type="button" className={form.upgradeable ? "btn-glow px-3 py-2 text-xs" : "btn-ghost px-3 py-2 text-xs"}>Можно улучшить</button>
                    <input value={form.maxLevel} onChange={(e) => setForm((f) => ({ ...f, maxLevel: form.category === "nft" ? "2" : e.target.value.replace(/\D/g, "") }))} placeholder="Lv" disabled={form.category === "nft"} className="ng-input py-2.5 text-xs disabled:opacity-50" />
                    <input value={form.nftCollection} onChange={(e) => setForm((f) => ({ ...f, nftCollection: e.target.value }))} placeholder="NFT collection" className="ng-input py-2.5 text-xs" />
                  </div>
                  {(form.category === "nft" || form.effectType === "nft") && (
                    <div className="mt-2 rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-3 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-cyan-100"><Sparkles size={13} /> NFT reveal: одно улучшение</div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <label className="text-[11px] text-white/45">Цена улучшения NightCoins
                          <input value={form.upgradePriceCoins} onChange={(e) => setForm((f) => ({ ...f, upgradePriceCoins: e.target.value.replace(/\D/g, "") }))} placeholder="150" className="ng-input mt-1 py-2.5 text-xs" />
                        </label>
                        <label className="text-[11px] text-white/45">Коллекция / серия
                          <input value={form.nftCollection} onChange={(e) => setForm((f) => ({ ...f, nftCollection: e.target.value }))} placeholder="Night Bears S1" className="ng-input mt-1 py-2.5 text-xs" />
                        </label>
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label className="text-[11px] text-white/45">Модельки после улучшения — 1 строка = name|url или просто URL</label>
                          <button onClick={() => modelInputRef.current?.click()} type="button" className="rounded-xl glass px-2 py-1 text-[11px] text-white/60 hover:text-white">
                            {uploadingModel ? <Loader2 size={12} className="inline animate-spin" /> : <ImageIcon size={12} className="inline" />} загрузить
                          </button>
                        </div>
                        <input ref={modelInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pickNftModel(e.target.files?.[0])} />
                        <textarea value={form.nftModelsText} onChange={(e) => setForm((f) => ({ ...f, nftModelsText: e.target.value }))} rows={3} placeholder={"Bear Neon|https://.../bear-neon.png\nBear Gold|https://.../bear-gold.webm"} className="ng-input resize-none py-2.5 text-xs font-mono" />
                      </div>
                      <div>
                        <label className="text-[11px] text-white/45">Цвета фона — имя или #HEX, по одному в строке</label>
                        <textarea value={form.nftColorsText} onChange={(e) => setForm((f) => ({ ...f, nftColorsText: e.target.value }))} rows={3} placeholder={"Фиолетовый\nЦиан\nЗолото\n#fb7185"} className="ng-input mt-1 resize-none py-2.5 text-xs font-mono" />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {["Фиолетовый", "Циан", "Золото", "Розовый", "Изумруд", "Огненный", "Лёд"].map((color) => (
                            <button key={color} type="button" onClick={() => setForm((f) => ({ ...f, nftColorsText: Array.from(new Set([...linesToList(f.nftColorsText), color])).join("\n") }))} className="rounded-full bg-white/6 px-2 py-1 text-[10px] text-white/50 hover:text-white">{color}</button>
                          ))}
                        </div>
                      </div>
                      <div className="text-[11px] text-white/35">Покупатель сначала получает обычный NFT без номера. После платного улучшения один раз получает красивую reveal-анимацию, serial # по очереди улучшения, фон из цветов и случайную модельку.</div>
                    </div>
                  )}
                  <div className="text-[11px] text-white/35">Админ может создать фон, бейдж, рамку, цвет, glow, тему или NFT. NFT теперь раскрывается только через одно платное улучшение.</div>
                </div>

                <div className="rounded-3xl glass p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><Sparkles size={13} /> Night Drop / лимитированный товар</div>
                  <div className="grid sm:grid-cols-3 gap-2">
                    <label className="text-[11px] text-white/45">Старт
                      <input type="datetime-local" value={form.dropStartsAt} onChange={(e) => setForm((f) => ({ ...f, dropStartsAt: e.target.value }))} className="ng-input mt-1 py-2.5 text-xs" />
                    </label>
                    <label className="text-[11px] text-white/45">Конец
                      <input type="datetime-local" value={form.dropEndsAt} onChange={(e) => setForm((f) => ({ ...f, dropEndsAt: e.target.value }))} className="ng-input mt-1 py-2.5 text-xs" />
                    </label>
                    <label className="text-[11px] text-white/45">Тираж
                      <input value={form.stockTotal} onChange={(e) => setForm((f) => ({ ...f, stockTotal: e.target.value.replace(/\D/g, "") }))} placeholder="100" className="ng-input mt-1 py-2.5 text-xs" />
                    </label>
                  </div>
                  <div className="text-[11px] text-white/35">Оставь поля пустыми — товар будет обычным. Заполни даты/тираж — появится как Night Drop.</div>
                </div>
                <button onClick={save} disabled={saving || !form.name.trim() || !form.previewUrl.trim()} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />} Сохранить товар
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ==== Broadcast ====

function BroadcastSection() {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [body, setBody] = useState("");
  const [icon, setIcon] = useState("📢");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  async function send() {
    if (!title.trim()) return;
    setSending(true);
    try {
      const res = await api.sendBroadcast({ title, subtitle, body, icon });
      setSent(res.sent ?? 0);
      setTitle(""); setSubtitle(""); setBody("");
      setTimeout(() => setSent(null), 3000);
    } catch {}
    setSending(false);
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="glass rounded-2xl p-5 space-y-4">
        <h3 className="font-display font-bold text-sm flex items-center gap-2"><Megaphone size={16} className="text-neon-purple" /> Рассылка всем</h3>
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} placeholder="Заголовок" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
        </div>
        <div>
          <label className="text-xs text-white/55 mb-1.5 block">Подзаголовок</label>
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} placeholder="Краткое описание" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none focus:border-neon-purple/40" />
        </div>
        <div>
          <label className="text-xs text-white/55 mb-1.5 block">Текст</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} rows={3} placeholder="Полный текст…" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none resize-none focus:border-neon-purple/40" />
        </div>
        <button onClick={send} disabled={sending || !title.trim()} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2">
          {sending ? <><Loader2 size={16} className="animate-spin" /> Отправка…</> : sent !== null ? <><Check size={16} /> Отправлено {sent} юзерам!</> : <><Send size={16} /> Отправить всем</>}
        </button>
      </div>
    </div>
  );
}

// ==== Safety ====

function SafetySection() {
  const [events, setEvents] = useState<Record<string, unknown>[]>([]);
  const [flags, setFlags] = useState<Record<string, unknown>[]>([]);
  const [domains, setDomains] = useState<Record<string, unknown>[]>([]);
  const [trustedUsers, setTrustedUsers] = useState<Record<string, unknown>[]>([]);
  const [restrictedUsers, setRestrictedUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<Record<string, unknown>[]>([]);
  const [selectedSafety, setSelectedSafety] = useState<Record<string, unknown> | null>(null);
  const [restrictionHours, setRestrictionHours] = useState("24");
  const [restrictions, setRestrictions] = useState<Record<string, boolean>>({ noLinks: false, noUnknownDm: false, noPosts: false, messagingDisabled: false });
  const [trustOverride, setTrustOverride] = useState<"" | "trusted" | "restricted">("");
  const [domainForm, setDomainForm] = useState({ domain: "", action: "deny", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsData, flagsData, domainsData, trustedData, restrictedData] = await Promise.all([
        withAdminTimeout(api.getSafetyEvents(), [], 6000),
        withAdminTimeout(api.getSafetyFlags("open"), [], 6000),
        withAdminTimeout(api.getSafetyDomains(), [], 6000),
        withAdminTimeout(api.getSafetyUsers("trusted"), [], 6000),
        withAdminTimeout(api.getSafetyUsers("restricted"), [], 6000),
      ]);
      setEvents(eventsData as Record<string, unknown>[]);
      setFlags(flagsData as Record<string, unknown>[]);
      setDomains(domainsData as Record<string, unknown>[]);
      setTrustedUsers(trustedData as Record<string, unknown>[]);
      setRestrictedUsers(restrictedData as Record<string, unknown>[]);
    } catch {
      setEvents([]);
      setFlags([]);
      setDomains([]);
      setTrustedUsers([]);
      setRestrictedUsers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (userQuery.trim().length < 2) {
      setUserResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api.getAdminUsers(userQuery.trim(), 8).then((data) => setUserResults(data as Record<string, unknown>[])).catch(() => setUserResults([]));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [userQuery]);

  async function openSafetyUser(id: string) {
    const data = await api.getSafetyUser(id).catch(() => null) as Record<string, unknown> | null;
    if (!data) return;
    setSelectedSafety(data);
    const trust = (data.trust ?? {}) as Record<string, unknown>;
    const current = (trust.restrictions ?? {}) as Record<string, boolean>;
    setRestrictions({ noLinks: Boolean(current.noLinks), noUnknownDm: Boolean(current.noUnknownDm), noPosts: Boolean(current.noPosts), messagingDisabled: Boolean(current.messagingDisabled) });
    setTrustOverride((trust.override as "trusted" | "restricted" | null) ?? "");
  }

  async function saveSafetyUser(clear = false) {
    const userData = (selectedSafety?.user ?? {}) as Record<string, unknown>;
    const id = String(userData.id ?? "");
    if (!id) return;
    const hours = Math.max(1, Number(restrictionHours) || 24);
    const payload = clear
      ? { restrictions: {}, restrictedUntil: null, trustOverride: null }
      : { restrictions, restrictedUntil: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(), trustOverride: trustOverride || null };
    const data = await api.setSafetyRestrictions(id, payload).catch(() => null) as Record<string, unknown> | null;
    if (data) {
      setSelectedSafety((prev) => prev ? { ...prev, trust: data.trust } : prev);
      load();
    }
  }

  async function quickSafetyUser(id: string, action: "trusted" | "clear") {
    const payload = action === "trusted"
      ? { restrictions: {}, restrictedUntil: null, trustOverride: "trusted" as const }
      : { restrictions: {}, restrictedUntil: null, trustOverride: null };
    await api.setSafetyRestrictions(id, payload).catch(() => null);
    load();
  }

  async function addDomain() {
    if (!domainForm.domain.trim()) return;
    const row = await api.addSafetyDomain({ domain: domainForm.domain, action: domainForm.action as "allow" | "deny", reason: domainForm.reason }).catch(() => null);
    if (row) {
      setDomains((prev) => [row as Record<string, unknown>, ...prev.filter((d) => String(d.domain) !== String((row as Record<string, unknown>).domain))]);
      setDomainForm({ domain: "", action: "deny", reason: "" });
    }
  }

  async function removeDomain(domain: string) {
    await api.deleteSafetyDomain(domain).catch(() => {});
    setDomains((prev) => prev.filter((d) => String(d.domain) !== domain));
  }

  const activity = useMemo(() => {
    const hours = Array.from({ length: 12 }, (_, index) => {
      const d = new Date(Date.now() - (11 - index) * 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      return { label: `${String(d.getHours()).padStart(2, "0")}:00`, from: d.getTime(), count: 0 };
    });
    for (const event of events) {
      const ts = new Date(String(event.createdAt ?? event.created_at ?? "")).getTime();
      const bucket = hours.find((h, index) => ts >= h.from && (index === hours.length - 1 || ts < hours[index + 1].from));
      if (bucket) bucket.count += 1;
    }
    const max = Math.max(1, ...hours.map((h) => h.count));
    return hours.map((h) => ({ ...h, height: Math.max(8, (h.count / max) * 100) }));
  }, [events]);

  async function resolveFlag(id: string) {
    setResolving(id);
    try { await api.resolveSafetyFlag(id); } catch {}
    setResolving(null);
    load();
  }

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl glass-strong p-4">
          <div className="text-xs text-white/35">Открытые флаги</div>
          <div className="font-display text-2xl font-bold text-red-300">{flags.length}</div>
        </div>
        <div className="rounded-3xl glass-strong p-4">
          <div className="text-xs text-white/35">Spam events</div>
          <div className="font-display text-2xl font-bold text-amber-200">{events.length}</div>
        </div>
        <div className="rounded-3xl glass-strong p-4">
          <div className="text-xs text-white/35">Режим</div>
          <div className="font-display text-lg font-bold text-emerald-300">Soft cooldown</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-4xl glass-strong p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sm"><Star size={16} className="text-neon-gold" /> Trusted users</div>
            <span className="text-[11px] text-white/35">{trustedUsers.length}</span>
          </div>
          {trustedUsers.length === 0 ? <div className="rounded-3xl glass p-5 text-center text-xs text-white/35">Пока нет вручную доверенных</div> : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {trustedUsers.map((u) => {
                const trust = (u.trust ?? {}) as Record<string, unknown>;
                return (
                  <div key={String(u.id)} className="flex items-center gap-2 rounded-2xl glass px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">@{String(u.username ?? "")}</span>
                    <span className="text-[10px] text-neon-gold">{String(trust.score ?? "")}/100</span>
                    <button onClick={() => quickSafetyUser(String(u.id), "clear")} className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-white/45 hover:text-white">auto</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-4xl glass-strong p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-sm"><Ban size={16} className="text-red-300" /> Restricted users</div>
            <span className="text-[11px] text-white/35">{restrictedUsers.length}</span>
          </div>
          {restrictedUsers.length === 0 ? <div className="rounded-3xl glass p-5 text-center text-xs text-white/35">Активных ограничений нет</div> : (
            <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {restrictedUsers.map((u) => {
                const trust = (u.trust ?? {}) as Record<string, unknown>;
                const until = String(trust.restrictedUntil ?? u.safetyRestrictedUntil ?? u.safety_restricted_until ?? "");
                return (
                  <div key={String(u.id)} className="rounded-2xl glass px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">@{String(u.username ?? "")}</span>
                      <button onClick={() => quickSafetyUser(String(u.id), "trusted")} className="rounded-lg bg-neon-gold/10 px-2 py-1 text-[10px] text-neon-gold">trusted</button>
                      <button onClick={() => quickSafetyUser(String(u.id), "clear")} className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-white/45 hover:text-white">снять</button>
                    </div>
                    {until && <div className="mt-1 text-[10px] text-white/30">до {new Date(until).toLocaleString("ru-RU")}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-4xl glass-strong p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-sm"><Users size={16} className="text-neon-purple" /> Trust / Restricted mode</div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} className="ng-input py-2.5 pl-8 text-sm" placeholder="Найти пользователя…" />
          </div>
          {userResults.length > 0 && (
            <div className="mb-3 max-h-36 space-y-1 overflow-y-auto rounded-2xl glass p-2">
              {userResults.map((u) => (
                <button key={String(u.id)} onClick={() => openSafetyUser(String(u.id))} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/5">
                  <span className="min-w-0 flex-1 truncate text-sm">@{String(u.username ?? "")}</span>
                  <span className="text-[10px] text-white/35">{String(u.role ?? "user")}</span>
                </button>
              ))}
            </div>
          )}
          {selectedSafety ? (() => {
            const userData = (selectedSafety.user ?? {}) as Record<string, unknown>;
            const trust = (selectedSafety.trust ?? {}) as Record<string, unknown>;
            return (
              <div className="rounded-3xl bg-white/[0.03] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">@{String(userData.username ?? "")}</div>
                    <div className="text-xs text-white/40">Trust {String(trust.score ?? 0)}/100 · {String(trust.level ?? "unknown")}</div>
                  </div>
                  <CustomSelect
                    value={trustOverride}
                    onChange={(value) => setTrustOverride(value as "" | "trusted" | "restricted")}
                    options={[
                      { value: "", label: "auto" },
                      { value: "trusted", label: "trusted" },
                      { value: "restricted", label: "restricted" },
                    ]}
                    buttonClassName="min-h-9 rounded-xl px-2 py-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["noLinks", "Без ссылок"],
                    ["noUnknownDm", "Нет ЛС незнакомым"],
                    ["noPosts", "Нет постов"],
                    ["messagingDisabled", "Мут сообщений"],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => setRestrictions((prev) => ({ ...prev, [key]: !prev[key] }))} className={restrictions[key] ? "rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-200" : "rounded-xl glass px-3 py-2 text-xs text-white/55"}>{label}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={restrictionHours} onChange={(e) => setRestrictionHours(e.target.value.replace(/\D/g, ""))} className="ng-input flex-1 py-2.5 text-xs" placeholder="часов" />
                  <button onClick={() => saveSafetyUser(false)} className="btn-glow px-3 py-2 text-xs">Сохранить</button>
                  <button onClick={() => saveSafetyUser(true)} className="rounded-xl glass px-3 py-2 text-xs text-white/55">Снять</button>
                </div>
              </div>
            );
          })() : <div className="rounded-3xl glass p-6 text-center text-xs text-white/40">Выбери пользователя для trust/restricted режима</div>}
        </div>

        <div className="rounded-4xl glass-strong p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-sm"><Shield size={16} className="text-amber-200" /> Domain allow/deny</div>
          <div className="grid gap-2 sm:grid-cols-[1fr_92px]">
            <input value={domainForm.domain} onChange={(e) => setDomainForm((f) => ({ ...f, domain: e.target.value }))} className="ng-input py-2.5 text-sm" placeholder="example.com" />
            <CustomSelect
              value={domainForm.action}
              onChange={(value) => setDomainForm((f) => ({ ...f, action: value }))}
              options={[
                { value: "deny", label: "deny" },
                { value: "allow", label: "allow" },
              ]}
              buttonClassName="min-h-10 rounded-xl px-2 py-2 text-xs"
            />
          </div>
          <input value={domainForm.reason} onChange={(e) => setDomainForm((f) => ({ ...f, reason: e.target.value }))} className="ng-input mt-2 py-2.5 text-sm" placeholder="Причина / заметка" />
          <button onClick={addDomain} disabled={!domainForm.domain.trim()} className="btn-glow mt-2 w-full py-2.5 text-sm disabled:opacity-50">Добавить домен</button>
          <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {domains.length === 0 ? <div className="py-5 text-center text-xs text-white/35">Список доменов пуст</div> : domains.map((domain) => (
              <div key={String(domain.domain)} className="flex items-center gap-2 rounded-2xl glass px-3 py-2">
                <span className={String(domain.action) === "allow" ? "rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200" : "rounded-full bg-red-400/10 px-2 py-0.5 text-[10px] text-red-200"}>{String(domain.action)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-white/70">{String(domain.domain)}</span>
                <button onClick={() => removeDomain(String(domain.domain))} className="text-white/35 hover:text-red-300"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-4xl glass-strong p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-sm"><BarChart3 size={16} className="text-neon-purple" /> Активность за 12 часов</div>
        <div className="flex h-32 items-end gap-2 rounded-3xl glass px-3 py-3">
          {activity.map((item) => (
            <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-xl bg-gradient-to-t from-neon-purple to-amber-300" style={{ height: `${item.height}%`, opacity: item.count ? 0.95 : 0.22 }} />
              <span className="text-[9px] text-white/28">{item.label.slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-4xl glass-strong p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-sm"><Shield size={16} className="text-red-300" /> Moderation flags</div>
        {flags.length === 0 ? <div className="rounded-3xl glass p-6 text-center text-xs text-white/40">Открытых флагов нет</div> : (
          <div className="space-y-2">
            {flags.map((flag) => {
              const id = String(flag.id);
              const user = (flag.user ?? {}) as Record<string, unknown>;
              return (
                <div key={id} className="rounded-2xl glass px-3 py-3 flex items-center gap-3">
                  <AlertTriangle size={17} className="text-red-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{String(flag.reason ?? flag.type ?? "Safety flag")}</div>
                    <div className="text-xs text-white/40 truncate">@{String(user.username ?? "unknown")} · severity {String(flag.severity ?? 1)} · {timeAgo(String(flag.createdAt ?? flag.created_at ?? new Date().toISOString()))}</div>
                  </div>
                  <button onClick={() => resolveFlag(id)} disabled={resolving === id} className="btn-ghost px-3 py-1.5 text-xs">
                    {resolving === id ? <Loader2 size={12} className="animate-spin" /> : "Закрыть"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-4xl glass-strong p-4">
        <div className="mb-3 flex items-center gap-2 font-semibold text-sm"><ScrollText size={16} className="text-amber-200" /> Последние события антиспама</div>
        {events.length === 0 ? <div className="rounded-3xl glass p-6 text-center text-xs text-white/40">Событий нет или миграция ещё не применена</div> : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {events.map((event) => {
              const user = (event.user ?? {}) as Record<string, unknown>;
              return (
                <div key={String(event.id)} className="rounded-2xl glass px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">{String(event.eventType ?? event.event_type ?? "event")}</span>
                    <span className="min-w-0 truncate text-xs text-white/55">@{String(user.username ?? event.userId ?? event.user_id ?? "unknown")}</span>
                    <span className="ml-auto text-[10px] text-white/30">{timeAgo(String(event.createdAt ?? event.created_at ?? new Date().toISOString()))}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-white/35 truncate">{String(event.targetType ?? event.target_type ?? "")} {String(event.targetId ?? event.target_id ?? "")}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ==== Log ====

function LogSection() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    withAdminTimeout(api.getLogs(), [], 6000)
      .then((data) => active && setLogs(data as Record<string, unknown>[]))
      .catch(() => active && setLogs([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  if (loading) return <LoadingState />;
  if (logs.length === 0) return <EmptyState icon={ScrollText} text="Журнал пуст" />;

  return (
    <div className="space-y-2">
      {logs.map((l) => (
        <div key={String(l.id)} className="glass rounded-xl p-3 flex items-center gap-3">
          <ScrollText size={15} className="text-white/40 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm">{String(l.action ?? "")}: <b>@{String(l.targetUserName ?? l.target_user_name ?? "")}</b></div>
            <div className="text-xs text-white/40">{String(l.details ?? "")} · @{String(l.adminName ?? l.admin_name ?? "")} · {timeAgo(String(l.createdAt ?? l.created_at ?? new Date().toISOString()))}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
