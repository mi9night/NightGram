"use client";

// =============================================================================
//  NotificationToast — bottom global notification toast with close button.
// =============================================================================

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Bell } from "lucide-react";
import { useNotifications } from "@/context/NotificationsContext";
import { GlowAvatar } from "./GlowAvatar";
import { timeAgo } from "@/lib/utils";

export function NotificationToast() {
  const { toast } = useNotifications();
  const [hiddenId, setHiddenId] = useState<string | null>(null);

  useEffect(() => {
    if (toast?.id) setHiddenId(null);
  }, [toast?.id]);

  const visible = toast && hiddenId !== toast.id;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -18, x: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, x: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
          className="fixed top-24 right-4 z-[10090] w-80 max-w-[calc(100vw-2rem)]"
        >
          <div className="gradient-border rounded-2xl ng-solid p-3.5 flex items-center gap-3 shadow-glow-lg">
            <GlowAvatar src={toast.avatarUrl ?? null} alt={toast.title} size={42} glow="purple" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                <Bell size={13} className="text-neon-purple" /> {toast.title}
              </div>
              <div className="text-xs text-white/60 truncate">{toast.body}</div>
              <div className="text-[10px] text-white/35 mt-0.5">{timeAgo(toast.createdAt)}</div>
            </div>
            <button onClick={() => setHiddenId(toast.id)} className="grid h-7 w-7 place-items-center rounded-lg glass text-white/45 hover:text-white transition">
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
