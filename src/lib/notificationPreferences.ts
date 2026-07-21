import type { AppNotification, NotificationSettings, NotificationType } from "@/types";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  push: true,
  messages: true,
  directMessages: true,
  groupMessages: true,
  channelMessages: true,
  mentions: true,
  likes: true,
  comments: true,
  newFollowers: true,
  storeDrops: true,
  sounds: true,
  soundVolume: 65,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  quietHoursAllowMentions: true,
  showMessagePreview: true,
  notifyWhenFocused: true,
};

export function normalizeNotificationSettings(value?: Partial<NotificationSettings> | string | null): NotificationSettings {
  let parsed: Partial<NotificationSettings> = {};
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as Partial<NotificationSettings>; } catch { parsed = {}; }
  } else if (value && typeof value === "object") {
    parsed = value;
  }
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
  return {
    ...settings,
    soundVolume: Math.max(0, Math.min(100, Number(settings.soundVolume ?? 65))),
    quietHoursStart: /^\d{2}:\d{2}$/.test(settings.quietHoursStart || "") ? settings.quietHoursStart : "22:00",
    quietHoursEnd: /^\d{2}:\d{2}$/.test(settings.quietHoursEnd || "") ? settings.quietHoursEnd : "08:00",
  };
}

function minutesFromClock(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
}

export function isQuietHours(settingsInput?: Partial<NotificationSettings> | null, now = new Date()): boolean {
  const settings = normalizeNotificationSettings(settingsInput);
  if (!settings.quietHoursEnabled) return false;
  const start = minutesFromClock(settings.quietHoursStart);
  const end = minutesFromClock(settings.quietHoursEnd);
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

export function notificationCategoryEnabled(type: NotificationType, settingsInput?: Partial<NotificationSettings> | null): boolean {
  const settings = normalizeNotificationSettings(settingsInput);
  if (!settings.push) return false;
  if (type === "like") return settings.likes;
  if (type === "comment") return settings.comments;
  if (type === "follow") return settings.newFollowers;
  if (type === "store") return settings.storeDrops;
  if (type === "mention") return settings.mentions;
  if (type === "message") return settings.messages;
  return true;
}

export function shouldPresentAppNotification(notification: AppNotification, settingsInput?: Partial<NotificationSettings> | null): boolean {
  const settings = normalizeNotificationSettings(settingsInput);
  if (!notificationCategoryEnabled(notification.type, settings)) return false;
  if (!isQuietHours(settings)) return true;
  return notification.type === "mention" && settings.quietHoursAllowMentions;
}

export type MessageConversationKind = "direct" | "group" | "channel";

export function shouldPresentMessageNotification(options: {
  settings?: Partial<NotificationSettings> | null;
  kind?: MessageConversationKind | string | null;
  mentioned?: boolean;
  muted?: boolean;
  focused?: boolean;
  now?: Date;
}): boolean {
  const settings = normalizeNotificationSettings(options.settings);
  if (!settings.push || !settings.messages || options.muted) return false;
  if (options.focused && !settings.notifyWhenFocused) return false;
  if (options.mentioned) {
    if (!settings.mentions) return false;
    if (isQuietHours(settings, options.now) && !settings.quietHoursAllowMentions) return false;
    return true;
  }
  if (options.kind === "direct" && !settings.directMessages) return false;
  if (options.kind === "channel" && !settings.channelMessages) return false;
  if ((!options.kind || options.kind === "group") && !settings.groupMessages) return false;
  return !isQuietHours(settings, options.now);
}

let audioContext: AudioContext | null = null;

export function playNotificationSound(settingsInput?: Partial<NotificationSettings> | null, priority = false): void {
  const settings = normalizeNotificationSettings(settingsInput);
  if (!settings.sounds || settings.soundVolume <= 0) return;
  if (isQuietHours(settings) && !(priority && settings.quietHoursAllowMentions)) return;
  try {
    audioContext ||= new AudioContext();
    const startedAt = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(priority ? 880 : 660, startedAt);
    oscillator.frequency.exponentialRampToValueAtTime(priority ? 1040 : 760, startedAt + 0.09);
    const volume = (settings.soundVolume / 100) * 0.085;
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), startedAt + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.18);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + 0.2);
  } catch {
    // Sound is optional and may be blocked before the first user interaction.
  }
}

export function safeNotificationPreview(settingsInput: Partial<NotificationSettings> | null | undefined, body: string): string {
  return normalizeNotificationSettings(settingsInput).showMessagePreview ? body : "Новое уведомление NightGram";
}
