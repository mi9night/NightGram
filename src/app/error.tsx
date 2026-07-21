"use client";

import { useEffect } from "react";
import { AlertTriangle, FolderOpen, RefreshCw, RotateCw } from "lucide-react";
import { reportClientError } from "@/lib/diagnostics";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError("next-route-boundary", error, { digest: error.digest || null });
  }, [error]);

  const bridge = typeof window !== "undefined" ? window.nightgramDesktop : undefined;

  return (
    <main className="grid min-h-[70vh] place-items-center px-4 py-16">
      <section className="w-full max-w-lg rounded-[2rem] border border-red-300/15 bg-black/40 p-7 text-center shadow-2xl backdrop-blur-2xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-400/10 text-red-200">
          <AlertTriangle size={26} />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold">Экран не удалось открыть</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          NightGram сохранил технические сведения локально. Можно повторить загрузку без выхода из аккаунта.
        </p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-white/30">Код: {error.digest}</p>}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button onClick={reset} className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm">
            <RefreshCw size={16} /> Повторить
          </button>
          <button onClick={() => window.location.reload()} className="btn-ghost inline-flex items-center justify-center gap-2 px-4 py-3 text-sm">
            <RotateCw size={16} /> Перезагрузить
          </button>
          {bridge && (
            <button
              onClick={() => void bridge.openDiagnostics()}
              className="btn-ghost inline-flex items-center justify-center gap-2 px-4 py-3 text-sm sm:col-span-2"
            >
              <FolderOpen size={16} /> Открыть диагностику
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
