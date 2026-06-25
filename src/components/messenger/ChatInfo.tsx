"use client";

// =============================================================================
//  Messenger — right panel: real chat info, members, shared media/files/links
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, Image as ImageIcon, FileText, Link2, Users, Shield, Copy } from "lucide-react";
import type { Conversation, Message } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { ColoredUsername } from "@/components/shared/Badges";
import { MediaViewer, type MediaViewerItem } from "@/components/shared/MediaViewer";
import { api } from "@/lib/api";
import { pushGlobalToast } from "@/lib/toast";
import { useAuth } from "@/context/AuthContext";

export function ChatInfo({ conversation, onConversationPatch }: { conversation: Conversation; onConversationPatch?: (id: string, patch: Partial<Conversation>) => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewer, setViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);
  const [mediaMode, setMediaMode] = useState<"all" | "sent" | "received">("all");
  const [details, setDetails] = useState<"files" | "links" | null>(null);
  const isGroupChat = conversation.type === "group";
  const isChannelChat = isGroupChat && /(?:· чат|чат канала)/i.test(conversation.title);
  const other = conversation.participants.find((p) => p.id !== user?.id) ?? conversation.participants[0];

  useEffect(() => {
    let active = true;
    api.getMessages(conversation.id)
      .then((data) => active && setMessages(data))
      .catch(() => active && setMessages([]));
    return () => { active = false; };
  }, [conversation.id]);

  const media = useMemo<MediaViewerItem[]>(() => messages
    .filter((m) => {
      if (!((m.type === "image" || m.type === "video") && m.attachmentUrl)) return false;
      if (mediaMode === "sent") return m.senderId === user?.id;
      if (mediaMode === "received") return m.senderId !== user?.id;
      return true;
    })
    .map((m) => ({ id: m.id, type: m.type === "video" ? "video" : "image", url: m.attachmentUrl! })), [mediaMode, messages, user?.id]);

  const files = messages.filter((m) => m.type === "file" || (m.attachmentUrl && m.type !== "image" && m.type !== "video"));
  const links = messages.flatMap((m) => ((m.text ?? "").match(/https?:\/\/\S+/g) ?? []).map((url) => ({ url, messageId: m.id, createdAt: m.createdAt })));
  const filesCount = files.length;
  const linksCount = links.length;

  async function toggleMute() {
    try {
      const res = await api.toggleConversationMute(conversation.id);
      onConversationPatch?.(conversation.id, { muted: res.muted });
    } catch {
      // keep UI stable
    }
  }

  async function copyInvite() {
    if (conversation.type !== "group") return;
    try {
      const { code } = await api.createConversationInvite(conversation.id);
      const url = `${window.location.origin}/invite/${code}`;
      await navigator.clipboard.writeText(url);
      pushGlobalToast("Ссылка приглашения скопирована", "success");
    } catch {
      pushGlobalToast("Создавать ссылку могут только админы группы", "error");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full"
    >
      {/* Profile head */}
      <div className="flex flex-col items-center p-5 border-b border-white/5 text-center">
        <GlowAvatar src={conversation.avatarUrl} alt={conversation.title} size={72} glow="purple" online={conversation.isOnline} />
        <h3 className="mt-3 font-display font-bold text-base">{conversation.title}</h3>
        {other && <ColoredUsername username={other.username} color={other.nameColor} className="text-xs mt-0.5" />}
        <p className="text-xs text-white/45 mt-1">
          {isGroupChat ? (isChannelChat ? `${conversation.participants.length} участников · чат канала` : `${conversation.participants.length} участников`) : conversation.isOnline ? "в сети" : "не в сети"}
        </p>
        {conversation.muted && <p className="text-[11px] text-white/35 mt-1">Чат заглушён — всплывающие уведомления отключены</p>}

        <div className="flex gap-2 mt-4 w-full">
          <button className="btn-glow flex-1 py-2.5 text-sm">Сообщение</button>
          <button onClick={toggleMute} className={conversation.muted ? "rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-white/45" : "btn-ghost px-3 py-2.5"} title={conversation.muted ? "Включить уведомления" : "Заглушить чат"}>
            {conversation.muted ? <BellOff size={16} /> : <Bell size={16} />}
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-white/70">
          <Users size={15} /> Участники
        </div>
        <div className="space-y-2">
          {conversation.participants.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <GlowAvatar src={p.avatarUrl} alt={p.username} size={34} online={p.isOnline} />
              <div className="flex-1 min-w-0">
                <ColoredUsername username={p.username} color={p.nameColor} className="text-sm" />
                <div className="text-[11px] text-white/40">{p.isOnline ? "в сети" : "офлайн"}</div>
              </div>
              {!isChannelChat && p.role !== "member" && (
                <span className="rounded-md bg-neon-purple/15 px-1.5 py-0.5 text-[10px] text-neon-purple">
                  {p.role === "owner" ? "владелец" : "админ"}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Shared media */}
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-white/70">
          <ImageIcon size={15} /> Медиа
        </div>
        <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {([
            ["all", "Все"],
            ["sent", "Отправленные"],
            ["received", "Полученные"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMediaMode(id)}
              className={mediaMode === id ? "rounded-lg bg-neon-purple/20 border border-neon-purple/40 px-2.5 py-1 text-[11px] text-white" : "rounded-lg glass px-2.5 py-1 text-[11px] text-white/55"}
            >
              {label}
            </button>
          ))}
        </div>
        {media.length === 0 ? (
          <div className="rounded-2xl glass p-5 text-center text-xs text-white/40">Медиа пока нет</div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {media.slice(0, 12).map((item, i) => (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.05 }}
                onClick={() => setViewer({ items: media, index: i })}
                className="aspect-square rounded-lg overflow-hidden bg-white/5"
              >
                {item.type === "video" ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={item.url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </motion.button>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <button onClick={() => setDetails((v) => v === "files" ? null : "files")} className="w-full flex items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white transition">
            <FileText size={16} /> Файлы <span className="ml-auto text-white/30">{filesCount}</span>
          </button>
          {details === "files" && (
            <div className="rounded-2xl glass p-3 text-xs text-white/50 space-y-2">
              {files.length === 0 ? "Файлов пока нет" : files.map((file) => (
                <a key={file.id} href={file.attachmentUrl} target="_blank" rel="noreferrer" className="block truncate hover:text-white">{file.text || file.attachmentUrl}</a>
              ))}
            </div>
          )}
          <button onClick={() => setDetails((v) => v === "links" ? null : "links")} className="w-full flex items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white transition">
            <Link2 size={16} /> Ссылки <span className="ml-auto text-white/30">{linksCount}</span>
          </button>
          {details === "links" && (
            <div className="rounded-2xl glass p-3 text-xs text-white/50 space-y-2 max-h-40 overflow-y-auto">
              {links.length === 0 ? "Ссылок пока нет" : links.map((link) => (
                <a key={`${link.messageId}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="block truncate hover:text-white">{link.url}</a>
              ))}
            </div>
          )}
        </div>
      </div>

      {conversation.type === "group" && (
        <div className="p-4 border-t border-white/5">
          <button onClick={copyInvite} className="w-full flex items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white transition">
            <Copy size={16} /> Скопировать ссылку приглашения
          </button>
        </div>
      )}

      <div className="p-4 border-t border-white/5">
        <button className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:text-white transition">
          <Shield size={15} /> Конфиденциальность
        </button>
      </div>

      <MediaViewer items={viewer?.items ?? []} initialIndex={viewer?.index ?? 0} open={Boolean(viewer)} onClose={() => setViewer(null)} />
    </motion.div>
  );
}
