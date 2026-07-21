"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

export default function SoundCloudCallbackPage() {
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("ng_integrations") || "[]") as string[];
    localStorage.setItem("ng_integrations", JSON.stringify(Array.from(new Set([...saved, "soundcloud"]))));
  }, []);

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="glass-strong rounded-4xl p-8 text-center max-w-sm">
        <CheckCircle size={42} className="mx-auto mb-4 text-green-400" />
        <h1 className="font-display font-bold text-xl">SoundCloud подключён</h1>
        <p className="text-sm text-white/50 mt-2">Можно вернуться в настройки NightGram.</p>
        <Link href="/settings" className="btn-glow mt-5 inline-flex px-5 py-2.5 text-sm">Вернуться</Link>
      </div>
    </main>
  );
}
