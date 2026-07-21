"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";

export function LandingFooter() {
  return (
    <footer className="relative px-6 pt-16 pb-10 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <NightGramWordmark size={36} />
            <p className="mt-3 text-white/55 max-w-xs text-sm">
              Тёмная неоновая платформа. Создана для ночи,
              синхронизирована на всех устройствах.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-white/80">Продукт</h4>
            <ul className="space-y-2 text-sm text-white/55">
              <li><Link href="/feed" className="hover:text-neon-purple transition">Лента</Link></li>
              <li><Link href="/messages" className="hover:text-neon-purple transition">Мессенджер</Link></li>
              <li><Link href="/store" className="hover:text-neon-purple transition">Night Store</Link></li>
              <li><Link href="/register" className="hover:text-neon-purple transition">Premium</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-white/80">Экосистема</h4>
            <ul className="space-y-2 text-sm text-white/55">
              <li>Мобильное приложение</li>
              <li>Backend API</li>
              <li>База данных Supabase</li>
              <li>Синхронизация в реальном времени</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-white/5 text-sm text-white/40">
          <span>© {new Date().getFullYear()} NightGram. Все права защищены.</span>
          <span className="inline-flex items-center gap-1.5">
            Сделано с <Heart size={13} className="fill-neon-pink text-neon-pink" /> в темноте
          </span>
        </div>
      </div>
    </footer>
  );
}
