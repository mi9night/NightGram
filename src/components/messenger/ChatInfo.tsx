"use client";

// =============================================================================
//  Messenger — right panel: chat info, members, shared media
// =============================================================================

import { motion } from "framer-motion";
import { Bell, Image as ImageIcon, FileText, Link2, Users, Shield } from "lucide-react";
import type { Conversation } from "@/types";
import { GlowAvatar } from "@/components/shared/GlowAvatar";
import { ColoredUsername } from "@/components/shared/Badges";

export function ChatInfo({ conversation }: { conversation: Conversation }) {
  const other = conversation.participants[0];
  const media = [
    "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=200&h=200&fit=crop",
    "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=200&h=200&fit=crop",
    "https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=200&h=200&fit=crop",
    "https://images.unsplash.com/photo-1493514789931-586cb221d7a7?w=200&h=200&fit=crop",
    "https://images.unsplash.com/photo-1574169208507-84376144848b?w=200&h=200&fit=crop",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col h-full"
    >
      {/* Profile head */}
      <div className="flex flex-col items-center p-6 border-b border-white/5 text-center">
        <GlowAvatar src={conversation.avatarUrl} alt={conversation.title} size={88} glow="purple" online={conversation.isOnline} />
        <h3 className="mt-3 font-display font-bold text-lg">{conversation.title}</h3>
        <ColoredUsername username={other.username} color={other.nameColor} className="text-sm mt-0.5" />
        <p className="text-xs text-white/45 mt-1">
          {conversation.isOnline ? "в сети" : "был(а) недавно"}
        </p>

        <div className="flex gap-2 mt-4 w-full">
          <button className="btn-glow flex-1 py-2.5 text-sm">Сообщение</button>
          <button className="btn-ghost px-3 py-2.5">
            <Bell size={16} />
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
              <GlowAvatar src={p.avatarUrl} alt={p.username} size={36} online={p.isOnline} />
              <div className="flex-1 min-w-0">
                <ColoredUsername username={p.username} color={p.nameColor} className="text-sm" />
                <div className="text-[11px] text-white/40">{p.isOnline ? "в сети" : "офлайн"}</div>
              </div>
              {p.role !== "member" && (
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
          <ImageIcon size={15} /> Общие медиа
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {media.map((src, i) => (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className="aspect-square rounded-lg overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </motion.div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <button className="w-full flex items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white transition">
            <FileText size={16} /> Файлы <span className="ml-auto text-white/30">12</span>
          </button>
          <button className="w-full flex items-center gap-3 rounded-xl glass px-3 py-2.5 text-sm text-white/70 hover:text-white transition">
            <Link2 size={16} /> Ссылки <span className="ml-auto text-white/30">5</span>
          </button>
        </div>
      </div>

      <div className="p-4 border-t border-white/5">
        <button className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/60 hover:text-white transition">
          <Shield size={15} /> Конфиденциальность
        </button>
      </div>
    </motion.div>
  );
}
