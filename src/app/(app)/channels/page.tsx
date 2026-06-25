"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Radio, Check, Loader2, Plus, X, Camera, Sparkles, Search } from "lucide-react";
import { api } from "@/lib/api";
import { formatCount } from "@/lib/utils";
import { uploadMedia } from "@/lib/upload";
import { useAuth } from "@/context/AuthContext";

interface ChannelRow {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  description: string;
  tags?: string[];
  subscribersCount: number;
  verified: boolean;
  ownerId?: string;
  subscribed?: boolean;
}

const SUGGESTED_TAGS = ["Новости", "Игры", "Музыка", "Мемы", "Арт", "NightGram", "Технологии", "Общение"];

export default function ChannelsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ChannelRow | null>(null);

  useEffect(() => {
    let active = true;
    api.getChannels()
      .then((data) => active && setChannels(data as ChannelRow[]))
      .catch(() => active && setChannels([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (channels.length === 0) return;
    const handle = new URLSearchParams(window.location.search).get("edit");
    if (!handle) return;
    const channel = channels.find((c) => c.handle === handle);
    if (channel) setEditing(channel);
  }, [channels]);

  async function toggle(id: string) {
    setProcessing(id);
    try {
      const res = await api.toggleChannelSubscription(id);
      setChannels((prev) => prev.map((c) => c.id === id ? {
        ...c,
        subscribed: res.subscribed,
        subscribersCount: Math.max(0, c.subscribersCount + (res.subscribed ? 1 : -1)),
      } : c));
    } catch {
      // migrations may be missing — keep UI stable
    }
    setProcessing(null);
  }

  const filteredChannels = channels.filter((channel) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${channel.name} ${channel.handle} ${channel.description} ${(channel.tags ?? []).join(" ")}`.toLowerCase().includes(q);
  });

  function upsertChannel(row: ChannelRow) {
    setChannels((prev) => {
      const exists = prev.some((c) => c.id === row.id);
      return exists ? prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)) : [row, ...prev];
    });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center gap-4">
        <div className="flex-1">
          <h1 className="font-display font-bold text-3xl flex items-center gap-2">
            <Radio size={24} className="text-neon-purple" /> Каналы
          </h1>
          <p className="text-sm text-white/45">Подписывайся на паблики, новости и комьюнити NightGram</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-glow px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus size={16} /> Создать канал
        </button>
      </motion.div>

      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск каналов по названию, юзернейму, тегам…"
          className="w-full rounded-2xl glass-strong pl-11 pr-4 py-3 text-sm outline-none focus:border-neon-purple/40"
        />
      </div>

      {loading ? (
        <div className="grid place-items-center py-20 text-white/40"><Loader2 size={24} className="animate-spin" /></div>
      ) : filteredChannels.length === 0 ? (
        <div className="glass-strong rounded-4xl p-10 text-center text-white/45">
          <Radio size={34} className="mx-auto mb-3 text-neon-purple" />
          <p>Каналов пока нет — создай первый</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredChannels.map((channel, i) => {
            const canEdit = channel.ownerId === user?.id || ["admin", "owner", "co_owner", "moderator"].includes(user?.role ?? "");
            return (
              <motion.div
                key={channel.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.35) }}
                className="glass-strong rounded-4xl overflow-hidden"
              >
                <div className="h-24 bg-neon-purple/10 relative">
                  {channel.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={channel.bannerUrl} alt="" className="h-full w-full object-cover" />
                  ) : <div className="h-full w-full" style={{ background: "linear-gradient(120deg,var(--accent-main),var(--accent-tertiary),var(--accent-secondary))" }} />}
                </div>
                <div className="p-5 flex gap-4 -mt-8 relative">
                  <div className="h-16 w-16 rounded-2xl overflow-hidden bg-neon-purple/15 grid place-items-center shrink-0 shadow-glow">
                    {channel.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={channel.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : <Radio size={24} className="text-neon-purple" />}
                  </div>
                  <div className="min-w-0 flex-1 pt-7">
                    <div className="flex items-center gap-2">
                      <Link href={`/channels/${channel.handle}`} className="font-display font-bold truncate hover:underline">{channel.name}</Link>
                      {channel.verified && <Check size={15} className="text-neon-purple" />}
                    </div>
                    <div className="text-xs text-white/40">@{channel.handle} · {formatCount(channel.subscribersCount)} подписчиков</div>
                    <p className="text-sm text-white/60 mt-2 line-clamp-2">{channel.description}</p>
                    {channel.tags && channel.tags.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{channel.tags.map((t) => <span key={t} className="text-[10px] rounded-full bg-neon-purple/10 px-2 py-0.5 text-neon-purple">#{t}</span>)}</div>}
                    <div className="flex gap-2 mt-4 flex-wrap">
                      <button
                        onClick={() => toggle(channel.id)}
                        disabled={processing === channel.id}
                        className={channel.subscribed ? "btn-ghost px-4 py-2 text-sm" : "btn-glow px-4 py-2 text-sm"}
                      >
                        {processing === channel.id ? "…" : channel.subscribed ? "Вы подписаны" : "Подписаться"}
                      </button>

                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ChannelEditorModal open={createOpen || Boolean(editing)} channel={editing} onClose={() => { setCreateOpen(false); setEditing(null); }} onSaved={(c) => { upsertChannel(c); setCreateOpen(false); setEditing(null); }} />
    </div>
  );
}

function ChannelEditorModal({
  open,
  channel,
  onClose,
  onSaved,
}: {
  open: boolean;
  channel: ChannelRow | null;
  onClose: () => void;
  onSaved: (channel: ChannelRow) => void;
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [usedTags, setUsedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(channel?.name ?? "");
    setHandle(channel?.handle ?? "");
    setDescription(channel?.description ?? "");
    setAvatarUrl(channel?.avatarUrl ?? null);
    setBannerUrl(channel?.bannerUrl ?? null);
    setTags(channel?.tags ?? []);
    setCustomTag("");
    try { setUsedTags(JSON.parse(localStorage.getItem("ng_channel_used_tags") || "[]")); } catch { setUsedTags([]); }
    setError(null);
  }, [channel, open]);

  const previewHandle = useMemo(() => handle.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 32), [handle]);

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag].slice(0, 8));
  }
  function addCustomTag() {
    const tag = customTag.trim().replace(/^#/, "").slice(0, 24);
    if (!tag) return;
    setTags((prev) => prev.includes(tag) ? prev : [...prev, tag].slice(0, 8));
    const nextUsed = [tag, ...usedTags.filter((t) => t !== tag)].slice(0, 12);
    setUsedTags(nextUsed);
    localStorage.setItem("ng_channel_used_tags", JSON.stringify(nextUsed));
    setCustomTag("");
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function pick(file: File | undefined, type: "avatar" | "banner") {
    if (!file) return;
    setError(null);
    try {
      const url = await uploadMedia(file, "avatars");
      if (type === "avatar") setAvatarUrl(url);
      else setBannerUrl(url);
    } catch {
      // Fallback so channel creation is not blocked while Storage bucket is being configured.
      const dataUrl = await fileToDataUrl(file);
      if (type === "avatar") setAvatarUrl(dataUrl);
      else setBannerUrl(dataUrl);
      setError("Storage недоступен — изображение временно сохранено как data URL. Лучше настроить bucket nightgram-media.");
    }
  }

  async function save() {
    if (!name.trim()) return setError("Название канала обязательно");
    if (!previewHandle || previewHandle.length < 3) return setError("Юзернейм канала обязателен: минимум 3 символа");
    if (!avatarUrl) return setError("Аватарка канала обязательна");
    if (tags.length === 0) return setError("Добавь хотя бы один тег");
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), handle: previewHandle, description, avatarUrl, bannerUrl, tags };
      const raw = channel ? await api.updateChannel(channel.id, payload) : await api.createChannel(payload);
      const c = raw as Record<string, unknown>;
      onSaved({
        id: String(c.id),
        name: String(c.name ?? name),
        handle: String(c.handle ?? previewHandle),
        avatarUrl: (c.avatarUrl as string) ?? (c.avatar_url as string) ?? avatarUrl,
        bannerUrl: (c.bannerUrl as string) ?? (c.banner_url as string) ?? bannerUrl,
        description: String(c.description ?? description),
        tags: (c.tags as string[]) ?? tags,
        subscribersCount: Number(c.subscribersCount ?? c.subscribers_count ?? channel?.subscribersCount ?? 0),
        verified: Boolean(c.verified ?? channel?.verified ?? false),
        ownerId: (c.ownerId as string) ?? (c.owner_id as string) ?? channel?.ownerId,
        subscribed: channel?.subscribed ?? false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      setError(msg.includes("409") ? "Юзернейм канала уже занят или данные некорректны" : "Не удалось сохранить канал");
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
            <h3 className="font-display font-bold text-xl mb-2">{channel ? "Редактировать канал" : "Создать канал"}</h3>
            <p className="text-xs text-white/45 mb-4">Юзернейм канала — это короткий адрес после @, например <b className="text-white/70">@night_news</b>.</p>
            {error && <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
            <div className="h-32 rounded-3xl overflow-hidden relative mb-4 bg-white/5">
              {bannerUrl ? <img src={bannerUrl} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ background: "linear-gradient(120deg,var(--accent-main),var(--accent-tertiary),var(--accent-secondary))" }} />}
              <button onClick={() => bannerInput.current?.click()} className="absolute inset-0 grid place-items-center bg-black/35 opacity-0 hover:opacity-100 transition"><Camera size={24} /></button>
              <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0], "banner")} />
            </div>
            <div className="flex gap-4 mb-4">
              <button onClick={() => avatarInput.current?.click()} className="h-20 w-20 rounded-3xl overflow-hidden grid place-items-center glass shrink-0">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <Camera size={24} className="text-white/50" />}
              </button>
              <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0], "avatar")} />
              <div className="flex-1 grid sm:grid-cols-2 gap-3">
                <input value={name} onChange={(e) => { setName(e.target.value); if (!handle) setHandle(e.target.value); }} placeholder="Название канала *" className="rounded-xl glass px-3 py-2.5 text-sm outline-none" />
                <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Юзернейм канала *" className="rounded-xl glass px-3 py-2.5 text-sm outline-none" />
              </div>
            </div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} placeholder="Описание канала" className="w-full rounded-xl glass px-3 py-2.5 text-sm outline-none resize-none mb-4" />
            <div className="mb-4">
              <div className="text-xs text-white/50 mb-2">Теги</div>
              <div className="flex flex-wrap gap-2 mb-2">{SUGGESTED_TAGS.map((tag) => <button key={tag} onClick={() => toggleTag(tag)} className={tags.includes(tag) ? "btn-glow px-3 py-1.5 text-xs" : "btn-ghost px-3 py-1.5 text-xs"}>#{tag}</button>)}</div>
              {tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <button key={tag} onClick={() => toggleTag(tag)} className="rounded-full bg-neon-purple/15 px-2.5 py-1 text-xs text-neon-purple hover:bg-red-500/10 hover:text-red-300">
                      #{tag} ×
                    </button>
                  ))}
                </div>
              )}
              {usedTags.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 text-[11px] text-white/35">Ранее использованные</div>
                  <div className="flex flex-wrap gap-1.5">
                    {usedTags.map((tag) => <button key={tag} onClick={() => toggleTag(tag)} className="rounded-full glass px-2.5 py-1 text-xs text-white/55 hover:text-neon-purple">#{tag}</button>)}
                  </div>
                </div>
              )}
              <div className="flex gap-2"><input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }} placeholder="свой тег" className="flex-1 rounded-xl glass px-3 py-2 text-sm outline-none" /><button onClick={addCustomTag} className="btn-ghost px-3 py-2 text-sm">Добавить</button></div>
            </div>
            <button onClick={save} disabled={saving || !name.trim() || !previewHandle || !avatarUrl || tags.length === 0} className="btn-glow w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Сохранить
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
