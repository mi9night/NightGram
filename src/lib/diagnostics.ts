"use client";

type DiagnosticContext = Record<string, string | number | boolean | null | undefined>;

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:token|access_token|refresh_token|code)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, maxLength);
}

export function normalizeClientError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: cleanText(error.name || "Error", 120),
      message: cleanText(error.message || "Неизвестная ошибка интерфейса", 1200),
      stack: cleanText(error.stack || "", 5000),
    };
  }

  if (typeof error === "object" && error !== null) {
    try {
      return {
        name: "UnknownError",
        message: cleanText(JSON.stringify(error), 1200),
        stack: "",
      };
    } catch {
      // Ignore serialization failure and fall back to String below.
    }
  }

  return {
    name: "UnknownError",
    message: cleanText(error, 1200) || "Неизвестная ошибка интерфейса",
    stack: "",
  };
}

export function reportClientError(
  scope: string,
  error: unknown,
  context?: DiagnosticContext,
  level: "error" | "warn" = "error",
) {
  const bridge = typeof window !== "undefined" ? window.nightgramDesktop : undefined;
  if (!bridge) return;

  const normalized = normalizeClientError(error);
  void bridge.reportError({
    level,
    scope: cleanText(scope, 100),
    name: normalized.name,
    message: normalized.message,
    stack: normalized.stack,
    route: cleanText(window.location.pathname, 300),
    context,
  }).catch(() => {
    // Diagnostics must never create another user-facing failure.
  });
}
