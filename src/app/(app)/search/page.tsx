"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Loader2, Crown, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { formatCount } from "@/lib/utils";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) { setUsers([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      api.searchUsers(query.trim())
        .then((data) => setUsers(data as Record<string, unknown>[]))
        .catch(() => setUsers([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="max-w-3xl mx-auto px-4 pb-12">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <h1 className="font-display font-bold text-3xl flex items-center gap-2">
          <Search size={24} className="text-neon-purple" /> Поиск людей
        </h1>
        <p className="text-sm text-white/45">Ищи пользователей по username или имени</p>
      </motion.div>

      <div className="relative mb-5">
        <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Введите username…"
          autoFocus
          className="w-full rounded-2xl glass-strong pl-11 pr-4 py-3.5 text-sm outline-none focus:border-neon-purple/40"
        />
        {loading && <Loader2 size={17} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-white/40" />}
      </div>

      <div className="space-y-3">
        {query.trim().length < 2 ? (
          <div className="text-center py-16 text-white/40">Введите минимум 2 символа</div>
        ) : !loading && users.length === 0 ? (
          <div className="text-center py-16 text-white/40">Никого не нашли</div>
        ) : users.map((u, i) => (
          <motion.div key={String(u.id)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.25) }}>
            <Link href={`/profile/${String(u.username ?? "")}`} className="glass-strong rounded-3xl p-4 flex items-center gap-3 hover:brightness-110 transition">
              <GlowAvatar src={(u.avatarUrl as string) ?? (u.avatar_url as string) ?? null} alt={String(u.username ?? "")} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate" style={{ color: String(u.nameColor ?? u.name_color ?? "#fff") }}>
                    {String(u.displayName ?? u.display_name ?? u.username ?? "")}
                  </span>
                  {Boolean(u.isPremium ?? u.is_premium) && <Crown size={14} className="text-neon-gold" />}
                  {String(u.role ?? "user") !== "user" && <Shield size={14} className="text-neon-purple" />}
                </div>
                <div className="text-xs text-white/45">@{String(u.username ?? "")}</div>
                <div className="mt-1 flex gap-3 text-[11px] text-white/35">
                  <span>{formatCount(Number(u.followersCount ?? u.followers_count ?? 0))} подписчиков</span>
                  <span>{formatCount(Number(u.followingCount ?? u.following_count ?? 0))} подписок</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
