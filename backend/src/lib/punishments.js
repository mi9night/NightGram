const { supabase } = require("./supabase");

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

function isActivePunishment(row) {
  if (!row || row.active === false) return false;
  if (!row.expires_at) return true;
  return new Date(row.expires_at).getTime() > Date.now();
}

async function cleanupExpiredPunishments(userId) {
  await safe(
    supabase
      .from("punishments")
      .update({ active: false })
      .eq("user_id", userId)
      .eq("active", true)
      .not("expires_at", "is", null)
      .lte("expires_at", new Date().toISOString()),
    { error: null },
  );
}

async function getActivePunishments(userId, types = []) {
  if (!userId) return [];
  await cleanupExpiredPunishments(userId);
  let query = supabase
    .from("punishments")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);
  if (types.length) query = query.in("type", types);
  const { data, error } = await safe(query, { data: [], error: null });
  if (error) return [];
  return (data || []).filter(isActivePunishment);
}

async function hasActivePunishment(userId, type) {
  const list = await getActivePunishments(userId, [type]);
  return list[0] || null;
}

function punishmentMessage(punishment) {
  if (!punishment) return "Действие ограничено";
  const until = punishment.expires_at ? ` до ${new Date(punishment.expires_at).toLocaleString("ru-RU")}` : " навсегда";
  if (punishment.type === "ban") return `Аккаунт заблокирован${until}. Причина: ${punishment.reason || "не указана"}`;
  if (punishment.type === "mute_dm") return `Сообщения временно отключены${until}. Причина: ${punishment.reason || "не указана"}`;
  if (punishment.type === "mute_posts") return `Публикации и комментарии временно отключены${until}. Причина: ${punishment.reason || "не указана"}`;
  return punishment.reason || "Действие ограничено";
}

module.exports = { getActivePunishments, hasActivePunishment, punishmentMessage };
