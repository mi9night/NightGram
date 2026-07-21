"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/diagnostics";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError("next-global-boundary", error, { digest: error.digest || null });
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, background: "#05030b", color: "white", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section
            style={{
              width: "min(520px, 100%)",
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 28,
              padding: 28,
              background: "rgba(15,10,25,.88)",
              textAlign: "center",
              boxShadow: "0 24px 80px rgba(0,0,0,.45)",
            }}
          >
            <div style={{ fontSize: 36 }}>⚠️</div>
            <h1 style={{ margin: "14px 0 8px", fontSize: 25 }}>NightGram восстановил ошибку интерфейса</h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,.58)", lineHeight: 1.6, fontSize: 14 }}>
              Данные аккаунта не удалены. Повторите загрузку или полностью перезапустите приложение.
            </p>
            <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
              <button
                onClick={reset}
                style={{ border: 0, borderRadius: 14, padding: "12px 16px", fontWeight: 700, cursor: "pointer" }}
              >
                Повторить загрузку
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  border: "1px solid rgba(255,255,255,.14)",
                  borderRadius: 14,
                  padding: "12px 16px",
                  color: "white",
                  background: "rgba(255,255,255,.06)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Перезагрузить приложение
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
