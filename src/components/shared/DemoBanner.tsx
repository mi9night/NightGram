"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Info, X } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/** Small dismissible banner that appears only when running in demo mode
 *  — but NOT on login/register pages. */
export function DemoBanner() {
  const { isDemo } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(true);

  // Hide on auth pages so demo mode never shows during sign-in/up.
  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/";

  const visible = isDemo && open && !isAuthPage;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="max-w-7xl mx-auto px-4 pt-3">
            <div className="flex items-center gap-2 rounded-xl glass px-3 py-2 text-xs text-white/70">
              <Info size={14} className="text-neon-cyan shrink-0" />
              <span>
                <b className="text-neon-cyan">Demo mode.</b> Backend offline —
                the UI runs on realistic mock data. Connect the API &amp;
                Supabase to enable real-time sync.
              </span>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto shrink-0 text-white/40 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
