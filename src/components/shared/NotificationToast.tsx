"use client";

// =============================================================================
//  NotificationToast — slides in when a new notification arrives.
// =============================================================================

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useNotifications } from "@/context/NotificationsContext";
import { GlowAvatar } from "./GlowAvatar";
import { timeAgo } from "@/lib/utils";

export function NotificationToast() {
  const { toast } = useNotifications();

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: 20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="fixed top-20 right-4 z-[80] w-80 max-w-[calc(100vw-2rem)]"
        >
          <div className="gradient-border rounded-2xl ng-solid p-3.5 flex items-center gap-3 shadow-glow-lg">
            <GlowAvatar
              src={toast.avatarUrl ?? null}
              alt={toast.title}
              size={44}
              glow="purple"
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{toast.title}</div>
              <div className="text-xs text-white/60 truncate">{toast.body}</div>
              <div className="text-[10px] text-white/35 mt-0.5">{timeAgo(toast.createdAt)}</div>
            </div>
            <div className="h-2 w-2 rounded-full bg-neon-purple animate-pulse-glow shrink-0" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
