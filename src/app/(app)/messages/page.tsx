"use client";

// =============================================================================
//  NightGram Web — Messenger page (3-panel real-time chat, centered)
// =============================================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import type { Conversation } from "@/types";
import { ChatList } from "@/components/messenger/ChatList";
import { ChatView } from "@/components/messenger/ChatView";
import { ChatInfo } from "@/components/messenger/ChatInfo";
import { api } from "@/lib/api";

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getConversations().then((data) => {
      if (!active) return;
      setConversations(data);
      setActiveId(data[0]?.id ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  return (
    // SAME container width as the navigation bar (max-w-7xl + mx-auto + px-4)
    // so the messenger content lines up perfectly under the top nav.
    <div className="max-w-7xl mx-auto px-4 pb-24 md:pb-4">
      <div className={`grid gap-4 h-[calc(100vh-7rem)] ${
        showInfo
          ? "md:grid-cols-[340px_1fr] lg:grid-cols-[340px_1fr_300px]"
          : "md:grid-cols-[340px_1fr]"
      }`}>
        {/* Left — chat list */}
        <div
          className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${activeId ? "hidden md:block" : ""}`}
        >
          {loading ? (
            <ChatListSkeleton />
          ) : (
            <ChatList
              conversations={conversations}
              activeId={activeId}
              onSelect={setActiveId}
            />
          )}
        </div>

        {/* Center — chat view */}
        <div
          className={`glass-strong rounded-3xl overflow-hidden min-w-0 ${!activeId ? "hidden md:block" : ""}`}
        >
          {active ? (
            <ChatView
              conversation={active}
              onBack={() => setActiveId(null)}
              onToggleInfo={() => setShowInfo((v) => !v)}
            />
          ) : (
            <EmptyChat />
          )}
        </div>

        {/* Right — chat info */}
        <div
          className={`glass-strong rounded-3xl overflow-hidden min-w-0 hidden lg:block ${showInfo ? "lg:block" : "lg:hidden"}`}
        >
          {active && <ChatInfo conversation={active} />}
        </div>
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="h-full grid place-items-center p-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="h-20 w-20 rounded-full gradient-border grid place-items-center shadow-glow">
          <MessageSquare size={32} className="text-neon-purple" />
        </div>
        <div>
          <h3 className="font-display font-bold text-xl">Выбери чат</h3>
          <p className="text-white/50 text-sm mt-1 max-w-xs">
            Твои сообщения в реальном времени — синхронизированы с мобильным приложением.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function ChatListSkeleton() {
  return (
    <div className="p-4">
      <div className="skeleton h-7 w-32 rounded-lg mb-4" />
      <div className="skeleton h-10 rounded-xl mb-3" />
      <div className="flex gap-1.5 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-7 w-20 rounded-lg" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="skeleton h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 w-24 rounded-full" />
              <div className="skeleton h-2.5 w-40 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
