"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/diagnostics";

export function DesktopDiagnosticsBridge() {
  useEffect(() => {
    if (!window.nightgramDesktop) return;

    const onWindowError = (event: ErrorEvent) => {
      reportClientError("window-error", event.error || event.message, {
        filename: event.filename?.slice(0, 300),
        line: event.lineno,
        column: event.colno,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportClientError("unhandled-rejection", event.reason);
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
