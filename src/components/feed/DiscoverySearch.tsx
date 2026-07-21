"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Search, UserPlus, Radio, Heart, Loader2 } from "lucide-react";
import type { Post } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { api } from "@/lib/api";
import { pushGlobalToast } from "@/lib/toast";
import { formatCount } from "@/lib/utils";

export function DiscoverySearch({ posts }: { posts: Post[] }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [channels, setChannels] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const q = query.trim().toLowerCase();

  const postResults = useMemo(() => {
    if (q.length < 2) return [];
    return posts.filter((p) => (p.text ?? "").toLowerCase().includes(q)).slice(0, 4);
  }, [posts, q]);

  useEffect(() => {
    if (q.length < 2) {
      setUsers([]);
      setChannels([]);
      return;
    }
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const [u, c] = await Promise.all([api.searchUsers(q), api.getChannels()]);
        if (!active) return;
        setUsers((u as Record<string, unknown>[]).slice(0, 5));
        setChannels((c as Record<string, unknown>[]).filter((ch) => `${ch.name ?? ""} ${ch.handle ?? ""}`.toLowerCase().includes(q)).slice(0, 5));
      } catch {
        if (active) { setUsers([]); setChannels([]); }
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [q]);

  async function follow(userId: string) {
    try {
      const res = await api.socialAction("friend", userId);
      pushGlobalToast(res.friends ? "Вы теперь друзья" : "Вы подписались", "success");
    } catch { pushGlobalToast("Не удалось подписаться", "error"); }
  }
  async function subscribe(channelId: string) {
    try {
      const res = await api.toggleChannelSubscription(channelId);
      pushGlobalToast(res.subscribed ? "Вы подписались на канал" : "Вы отписались от канала", "success");
    } catch { pushGlobalToast("Не удалось подписаться", "error"); }
  }
  async function likePost(postId: string) {
    try { await api.toggleLike(postId); pushGlobalToast("Лайк отправлен", "success"); }
    catch { pushGlobalToast("Не удалось поставить лайк", "error"); }
  }

  const hasResults = q.length >= 2 && (users.length > 0 || channels.length > 0 || postResults.length > 0 || loading);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по постам, людям и каналам…"
          className="w-full rounded-2xl glass-strong pl-11 pr-4 py-3 text-sm outline-none focus:border-neon-purple/40"
        />
        {loading && <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-white/40" />}
      </div>

      <AnimatePresence>
        {hasResults && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="absolute left-0 right-0 top-14 z-[40] ng-solid rounded-3xl p-3 shadow-glow-lg max-h-[70vh] overflow-y-auto">
            {users.length > 0 && <SectionTitle title="Люди" />}
            {users.map((u) => (
              <div key={String(u.id)} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/5">
                <GlowAvatar src={(u.avatarUrl as string) ?? (u.avatar_url as string) ?? null} alt={String(u.username ?? "")} size={36} />
                <Link href={`/profile/${String(u.username ?? "")}`} className="min-w-0 flex-1" onClick={() => setQuery("")}> 
                  <div className="font-semibold text-sm truncate">{String(u.displayName ?? u.display_name ?? u.username ?? "")}</div>
                  <div className="text-xs text-white/40">@{String(u.username ?? "")}</div>
                </Link>
                <button onClick={() => follow(String(u.id))} className="btn-ghost px-3 py-1.5 text-xs"><UserPlus size={12} className="inline mr-1" /> Подписаться</button>
              </div>
            ))}

            {channels.length > 0 && <SectionTitle title="Каналы" />}
            {channels.map((ch) => (
              <div key={String(ch.id)} className="flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-white/5">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-neon-purple/15 text-neon-purple"><Radio size={16} /></div>
                <Link href={`/channels/${String(ch.handle ?? "")}`} className="min-w-0 flex-1" onClick={() => setQuery("")}> 
                  <div className="font-semibold text-sm truncate">{String(ch.name ?? "")}</div>
                  <div className="text-xs text-white/40">@{String(ch.handle ?? "")} · {formatCount(Number(ch.subscribersCount ?? ch.subscribers_count ?? 0))}</div>
                </Link>
                <button onClick={() => subscribe(String(ch.id))} className="btn-ghost px-3 py-1.5 text-xs">Подписаться</button>
              </div>
            ))}

            {postResults.length > 0 && <SectionTitle title="Посты" />}
            {postResults.map((p) => (
              <div key={p.id} className="flex items-start gap-3 rounded-2xl px-3 py-2 hover:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white/75 line-clamp-2">{p.text}</div>
                  <div className="text-xs text-white/35 mt-1">{formatCount(p.likesCount)} лайков</div>
                </div>
                <button onClick={() => likePost(p.id)} className="btn-ghost px-3 py-1.5 text-xs"><Heart size={12} className="inline mr-1" /> Лайк</button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-white/35">{title}</div>;
}
