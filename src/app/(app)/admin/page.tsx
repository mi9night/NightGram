"use client";

// =============================================================================
//  NightGram Web — Admin Panel (real API, no demo data)
//  Tabs: Тикеты · Пользователи · Наказания · Жалобы · Финансы · Рассылка · Журнал
// =============================================================================

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Ticket, Users, Gavel, Flag, DollarSign, Megaphone, ScrollText,
  Search, Ban, MicOff, AlertTriangle, Shield, Crown, ChevronLeft,
  Check, X, Loader2, UserCheck, Headphones, Star, Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

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
          {tab === "broadcast" && <BroadcastSection />}
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

// ==== Tickets ====

function TicketsSection() {
  const [filter, setFilter] = useState("all");
  const [tickets, setTickets] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await api.getTickets(filter); setTickets(data as Record<string, unknown>[]); } catch { setTickets([]); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    try { await api.updateTicket(id, { status }); } catch {}
    setUpdating(null);
    load();
  }

  const statusConfig: Record<string, { color: string; label: string }> = {
    open: { color: "#3b82f6", label: "Открыт" },
    in_progress: { color: "#fbbf24", label: "В работе" },
    resolved: { color: "#10b981", label: "Решён" },
    unresolved: { color: "#ef4444", label: "Не решён" },
    closed: { color: "#6b7280", label: "Закрыт" },
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {["all", "open", "in_progress", "resolved", "unresolved"].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("rounded-lg px-3 py-1.5 text-xs whitespace-nowrap transition",
              filter === f ? "bg-neon-purple/20 text-white border border-neon-purple/40" : "glass text-white/55")}>
            {f === "all" ? "Все" : statusConfig[f]?.label ?? f}
          </button>
        ))}
      </div>
      {loading ? <LoadingState /> : tickets.length === 0 ? <EmptyState icon={Ticket} text="Нет тикетов" /> : (
        tickets.map((t) => {
          const status = String(t.status ?? "open");
          const cfg = statusConfig[status] ?? statusConfig.open;
          return (
            <div key={String(t.id)} className="glass rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{String(t.subject ?? t.subject ?? "")}</div>
                  <div className="text-xs text-white/45 mt-0.5">
                    {String(t.category ?? "")} · @{String(t.authorName ?? t.author_name ?? "")} · {timeAgo(String(t.createdAt ?? t.created_at ?? new Date().toISOString()))}
                  </div>
                </div>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>
              </div>
              {Boolean(t.body) && <p className="text-xs text-white/55 mb-3">{String(t.body)}</p>}
              <div className="flex gap-1.5">
                {status === "open" && (
                  <button onClick={() => updateStatus(String(t.id), "in_progress")} disabled={updating === String(t.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}>
                    Взять в работу
                  </button>
                )}
                <button onClick={() => updateStatus(String(t.id), "resolved")} disabled={updating === String(t.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#34d399" }}>
                  Решено
                </button>
                <button onClick={() => updateStatus(String(t.id), "closed")} disabled={updating === String(t.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.35)", color: "#9ca3af" }}>
                  Закрыть
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
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
    try { const data = await api.getAdminUsers(search, 50); setUsers(data as Record<string, unknown>[]); } catch { setUsers([]); }
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
  const userId = String(user.id);
  const username = String(user.username ?? "");
  const isOwner = myRole === "owner" || myRole === "co_owner";
  const isAdmin = ["admin", "owner", "co_owner"].includes(myRole);

  async function doAction(action: string, fn: () => Promise<unknown>) {
    setProcessing(action);
    try { await fn(); } catch {}
    setProcessing(null);
  }

  async function punish(type: string, reason: string, duration: string) {
    await doAction(`punish_${type}`, () => api.createPunishment({ userId, type, reason, duration }));
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 w-full max-w-md ng-solid rounded-4xl p-6 shadow-glow-lg max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg">@{username}</h3>
          <button onClick={onClose} className="grid place-items-center h-8 w-8 rounded-lg glass text-white/50 hover:text-white"><X size={16} /></button>
        </div>

        {/* Punishments */}
        {isAdmin && (
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
          </div>
        )}

        {/* Verify */}
        {isAdmin && (
          <button onClick={() => doAction("verify", () => api.verifyUser(userId, true))}
            disabled={processing === "verify"}
            className="btn-ghost w-full py-2.5 text-sm mb-2 flex items-center justify-center gap-2">
            {processing === "verify" ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={15} />} Верифицировать
          </button>
        )}

        {/* Role change (owner only) */}
        {isOwner && (
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
        {isAdmin && (
          <div className="mb-4">
            <p className="text-xs text-white/55 ml-1 mb-2">Статистика:</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => doAction("coins", () => api.editUserStats(userId, { nightCoins: 1000 }))}
                disabled={processing === "coins"}
                className="rounded-lg px-3 py-2 text-xs glass hover:brightness-125">
                +1000 ✦
              </button>
              <button onClick={() => doAction("premium", () => api.editUserStats(userId, { isPremium: true, premiumUntil: new Date(Date.now() + 30*24*60*60*1000).toISOString() }))}
                disabled={processing === "premium"}
                className="rounded-lg px-3 py-2 text-xs glass hover:brightness-125">
                Выдать Premium
              </button>
            </div>
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
    try { const data = await api.getPunishments(); setList(data as Record<string, unknown>[]); } catch { setList([]); }
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
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await api.getReports(); setList(data as Record<string, unknown>[]); } catch { setList([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function action(id: string, act: string) {
    setProcessing(id);
    try { await api.actionReport(id, act); } catch {}
    setProcessing(null);
    load();
  }

  const catLabels: Record<string, string> = {
    spam: "Спам", scam: "Мошенничество", harassment: "Травля", nsfw: "18+", violence: "Насилие", copyright: "Авторские права", other: "Другое",
  };

  if (loading) return <LoadingState />;
  if (list.length === 0) return <EmptyState icon={Flag} text="Нет жалоб" />;

  return (
    <div className="space-y-3">
      {list.map((r) => {
        const status = String(r.status ?? "pending");
        return (
          <div key={String(r.id)} className="glass rounded-2xl p-4 flex items-center gap-3">
            <Flag size={18} className="text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{catLabels[String(r.category ?? "")] ?? String(r.category ?? "")}</div>
              <div className="text-xs text-white/45 mt-0.5">{String(r.reason ?? "")} · @{String(r.reporterName ?? r.reporter_name ?? "")} · {timeAgo(String(r.createdAt ?? r.created_at ?? new Date().toISOString()))}</div>
            </div>
            {status === "pending" ? (
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => action(String(r.id), "actioned")} disabled={processing === String(r.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", color: "#34d399" }}>
                  Принять
                </button>
                <button onClick={() => action(String(r.id), "reviewed")} disabled={processing === String(r.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.35)", color: "#9ca3af" }}>
                  Отклонить
                </button>
              </div>
            ) : <span className="text-xs text-white/40 shrink-0">Обработано</span>}
          </div>
        );
      })}
    </div>
  );
}

// ==== Finance ====

function FinanceSection() {
  const [filter, setFilter] = useState("all");
  const [requests, setRequests] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await api.getPurchaseRequests(filter); setRequests(data as Record<string, unknown>[]); } catch { setRequests([]); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) { setProcessing(id); try { await api.approvePurchase(id); } catch {} setProcessing(null); load(); }
  async function reject(id: string) { setProcessing(id); try { await api.rejectPurchase(id); } catch {} setProcessing(null); load(); }

  const statusConfig: Record<string, { color: string; label: string }> = {
    pending: { color: "#fbbf24", label: "Ожидание" },
    approved: { color: "#10b981", label: "Одобрено" },
    rejected: { color: "#ef4444", label: "Отклонено" },
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
              ) : <span className="rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0" style={{ background: `${cfg.color}22`, color: cfg.color }}>{cfg.label}</span>}
            </div>
          );
        })
      )}
    </div>
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

// ==== Log ====

function LogSection() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLogs().then((data) => setLogs(data as Record<string, unknown>[])).catch(() => setLogs([])).finally(() => setLoading(false));
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
