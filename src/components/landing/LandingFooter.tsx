"use client";

import Link from "next/link";
import { Apple, Smartphone, Heart } from "lucide-react";
import { NightGramWordmark } from "@/components/shared/NightGramLogo";

export function LandingFooter() {
  return (
    <footer className="relative px-6 pt-16 pb-10 border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <NightGramWordmark size={36} />
            <p className="mt-3 text-white/55 max-w-xs text-sm">
              The dark neon glass social platform. Built for the night,
              synced across every device.
            </p>
            <div className="flex gap-3 mt-5">
              <a href="#" className="glass rounded-xl px-3 py-2 inline-flex items-center gap-2 hover:border-neon-purple/50 transition">
                <Apple size={16} /> iOS
              </a>
              <a href="#" className="glass rounded-xl px-3 py-2 inline-flex items-center gap-2 hover:border-neon-purple/50 transition">
                <Smartphone size={16} /> Android
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-white/80">Product</h4>
            <ul className="space-y-2 text-sm text-white/55">
              <li><Link href="/feed" className="hover:text-neon-purple transition">Feed</Link></li>
              <li><Link href="/messages" className="hover:text-neon-purple transition">Messenger</Link></li>
              <li><Link href="/store" className="hover:text-neon-purple transition">Night Store</Link></li>
              <li><Link href="/register" className="hover:text-neon-purple transition">Premium</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3 text-white/80">Ecosystem</h4>
            <ul className="space-y-2 text-sm text-white/55">
              <li>Mobile App</li>
              <li>Backend API</li>
              <li>Supabase DB</li>
              <li>Real-time (Socket.io)</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-white/5 text-sm text-white/40">
          <span>© {new Date().getFullYear()} NightGram. All rights reserved.</span>
          <span className="inline-flex items-center gap-1.5">
            Made with <Heart size={13} className="fill-neon-pink text-neon-pink" /> in the dark
          </span>
        </div>
      </div>
    </footer>
  );
}
