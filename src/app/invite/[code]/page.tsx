"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MessageCircle, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function InvitePage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.joinConversationInvite(params.code)
      .then((res) => {
        localStorage.setItem("ng_open_chat", res.conversationId);
        router.replace("/messages");
      })
      .catch(() => {
        api.joinChannelInvite(params.code)
          .then((res) => {
            if (res.conversationId) localStorage.setItem("ng_open_chat", res.conversationId);
            router.replace(res.conversationId ? "/messages" : `/channels/${res.handle}`);
          })
          .catch(() => setError("Приглашение недействительно или истекло"));
      });
  }, [params.code, router]);

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="glass-strong rounded-4xl p-8 text-center max-w-sm">
        {error ? <AlertCircle size={42} className="mx-auto mb-4 text-red-300" /> : <MessageCircle size={42} className="mx-auto mb-4 text-neon-purple" />}
        <h1 className="font-display font-bold text-xl">Приглашение NightGram</h1>
        <p className="text-sm text-white/50 mt-2">{error ?? "Подключаем тебя к чату или приватному каналу…"}</p>
        {!error && <Loader2 size={22} className="animate-spin mx-auto mt-5 text-neon-purple" />}
        {error && <Link href="/messages" className="btn-glow mt-5 inline-flex px-5 py-2.5 text-sm">К сообщениям</Link>}
      </div>
    </main>
  );
}
