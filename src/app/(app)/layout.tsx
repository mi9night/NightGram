"use client";

// =============================================================================
//  NightGram Web — Authenticated app shell
// =============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/components/shared/AppNav";
import { useAuth } from "@/context/AuthContext";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = window.location.pathname;
      router.replace(`/?next=${encodeURIComponent(next)}`);
    }
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-neon-purple/30 border-t-neon-purple animate-spin" />
          <p className="text-sm text-white/50">Загрузка NightGram…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <AppNav />
      <main className="pt-24">{children}</main>
    </div>
  );
}
