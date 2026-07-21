const { supabase } = require("./supabase");

const DEFAULT_PRIVACY = Object.freeze({
  privacy_profile: "everyone",
  privacy_messages: "everyone",
  privacy_groups: "everyone",
  privacy_last_seen: "everyone",
  hide_read_receipts: false,
  filter_unknown_messages: true,
});

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

function normalizeAudience(value, fallback = "everyone") {
  return ["everyone", "following", "friends", "nobody"].includes(String(value || "")) ? String(value) : fallback;
}

async function getPrivacySettings(userId) {
  const result = await safe(
    supabase.from("users").select("privacy_profile,privacy_messages,privacy_groups,privacy_last_seen,hide_read_receipts,filter_unknown_messages").eq("id", userId).maybeSingle(),
    { data: null, error: null },
  );
  if (result.error && /privacy_|hide_read_receipts|filter_unknown_messages|schema cache|column/i.test(result.error.message || "")) {
    return { ...DEFAULT_PRIVACY };
  }
  const row = result.data || {};
  return {
    privacy_profile: normalizeAudience(row.privacy_profile),
    privacy_messages: normalizeAudience(row.privacy_messages),
    privacy_groups: normalizeAudience(row.privacy_groups),
    privacy_last_seen: normalizeAudience(row.privacy_last_seen),
    hide_read_receipts: Boolean(row.hide_read_receipts),
    filter_unknown_messages: row.filter_unknown_messages !== false,
  };
}

async function blockState(a, b) {
  if (!a || !b || String(a) === String(b)) return { blocked: false, blockedByA: false, blockedByB: false };
  const { data } = await safe(
    supabase.from("user_blocks").select("user_id,blocked_id").or(`and(user_id.eq.${a},blocked_id.eq.${b}),and(user_id.eq.${b},blocked_id.eq.${a})`),
    { data: [], error: null },
  );
  const rows = data || [];
  const blockedByA = rows.some((row) => String(row.user_id) === String(a) && String(row.blocked_id) === String(b));
  const blockedByB = rows.some((row) => String(row.user_id) === String(b) && String(row.blocked_id) === String(a));
  return { blocked: blockedByA || blockedByB, blockedByA, blockedByB };
}

async function relationship(viewerId, ownerId) {
  if (!viewerId || !ownerId || String(viewerId) === String(ownerId)) return { self: true, following: true, friends: true };
  const [follow, friendship] = await Promise.all([
    safe(supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", ownerId).maybeSingle(), { data: null }),
    safe(supabase.from("friendships").select("status").eq("user_id", ownerId).eq("friend_id", viewerId).eq("status", "accepted").maybeSingle(), { data: null }),
  ]);
  return { self: false, following: Boolean(follow.data), friends: Boolean(friendship.data) };
}

async function audienceAllows(ownerId, viewerId, audience) {
  if (String(ownerId) === String(viewerId)) return true;
  const normalized = normalizeAudience(audience);
  if (normalized === "everyone") return true;
  if (normalized === "nobody") return false;
  const rel = await relationship(viewerId, ownerId);
  return normalized === "friends" ? rel.friends : (rel.following || rel.friends);
}

async function privacyAllows(ownerId, viewerId, field) {
  const state = await blockState(ownerId, viewerId);
  if (state.blocked) return false;
  const settings = await getPrivacySettings(ownerId);
  return audienceAllows(ownerId, viewerId, settings[field] || "everyone");
}

async function canViewProfile(ownerId, viewerId) { return privacyAllows(ownerId, viewerId, "privacy_profile"); }
async function canMessage(ownerId, viewerId) { return privacyAllows(ownerId, viewerId, "privacy_messages"); }
async function canAddToGroups(ownerId, viewerId) { return privacyAllows(ownerId, viewerId, "privacy_groups"); }
async function canViewLastSeen(ownerId, viewerId) { return privacyAllows(ownerId, viewerId, "privacy_last_seen"); }

module.exports = {
  DEFAULT_PRIVACY,
  getPrivacySettings,
  blockState,
  relationship,
  audienceAllows,
  canViewProfile,
  canMessage,
  canAddToGroups,
  canViewLastSeen,
};
