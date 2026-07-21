"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";
import { cn } from "@/lib/utils";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 90, damping: 16 }}
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all duration-300",
        scrolled ? "py-2" : "py-4",
      )}
    >
      <div className="max-w-6xl mx-auto px-4">
        <div
          className={cn(
            "flex items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300",
            scrolled ? "glass-strong" : "bg-transparent",
          )}
        >
          <Link href="/">
            <NightGramWordmark size={32} />
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-white/70">
            <a href="#features" className="hover:text-white transition">Возможности</a>
            <a href="#premium" className="hover:text-white transition">Премиум</a>
            <Link href="/store" className="hover:text-white transition">Night Store</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost px-4 py-2 text-sm">
              Войти
            </Link>
            <Link href="/register" className="btn-glow px-4 py-2 text-sm">
              Регистрация
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
