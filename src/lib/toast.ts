export type GlobalToastKind = "default" | "success" | "error" | "info";

export interface GlobalToastPayload {
  message: string;
  kind?: GlobalToastKind;
}

export function pushGlobalToast(message: string, kind: GlobalToastKind = "default") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GlobalToastPayload>("nightgram:toast", { detail: { message, kind } }));
}
