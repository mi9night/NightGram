export {};

declare global {
  interface Window {
    nightgramNative?: {
      isNative: true;
      platform: "android" | "ios";
      enablePush(): Promise<{ supported: boolean; permission: NotificationPermission | "unsupported"; serverEnabled: boolean; subscribed: boolean }>;
      disablePush(): Promise<{ supported: boolean; permission: NotificationPermission | "unsupported"; serverEnabled: boolean; subscribed: boolean }>;
      getPushState(): Promise<{ supported: boolean; permission: NotificationPermission | "unsupported"; serverEnabled: boolean; subscribed: boolean }>;
      haptic(kind?: "light" | "medium" | "heavy"): Promise<void>;
      share(payload: { title?: string; text?: string; url?: string }): Promise<void>;
    };
  }
}
