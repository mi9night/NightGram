function parseClock(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return fallback;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return hours * 60 + minutes;
}

function quietHoursActive(settings, timezoneOffsetMinutes, date = new Date()) {
  if (!settings?.quietHoursEnabled) return false;
  const localMs = date.getTime() - Number(timezoneOffsetMinutes || 0) * 60_000;
  const local = new Date(localMs);
  const now = local.getUTCHours() * 60 + local.getUTCMinutes();
  const start = parseClock(settings.quietHoursStart, 22 * 60);
  const end = parseClock(settings.quietHoursEnd, 8 * 60);
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function categoryEnabled(settings, category) {
  if (!settings || settings.push === false) return false;
  if (category === "call") return true;
  if (category === "mention") return settings.mentions !== false;
  if (category === "direct") return settings.directMessages !== false && settings.messages !== false;
  if (category === "group") return settings.groupMessages !== false && settings.messages !== false;
  if (category === "channel") return settings.channelMessages !== false && settings.messages !== false;
  return settings.messages !== false;
}

function shouldDeliver(settings, timezoneOffsetMinutes, category, urgent, date = new Date()) {
  if (!categoryEnabled(settings, category)) return false;
  if (!urgent && quietHoursActive(settings, timezoneOffsetMinutes, date)) {
    return category === "mention" && settings?.quietHoursAllowMentions === true;
  }
  return true;
}

module.exports = { parseClock, quietHoursActive, categoryEnabled, shouldDeliver };
