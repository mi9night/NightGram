// Social routes — subscriptions/friends, favorites, blocked users, groups and channels
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

async function safe(promise, fallback = { data: [] }) {
  try { return await promise; } catch { return fallback; }
}

async function pushNotification(req, userId, notification) {
  const payload = { user_id: userId, ...notification };
  let result = await safe(supabase.from("notifications").insert(payload).select("*").single(), { data: null, error: null });
  if (result.error && /actor_id|action_type|schema cache/i.test(result.error.message || "")) {
    const { actor_id, action_type, ...legacy } = payload;
    result = await safe(supabase.from("notifications").insert(legacy).select("*").single(), { data: null, error: null });
  }
  const data = result.data;
  if (data) {
    req.app.get("io")?.to(`user:${userId}`).emit("notification:new", {
      id: data.id,
      type: data.type,
      title: data.title,
      body: data.body || "",
      avatarUrl: data.avatar_url || null,
      actorId: data.actor_id || notification.actor_id || null,
      actionType: data.action_type || notification.action_type || null,
      read: data.read || false,
      createdAt: data.created_at,
    });
  }
}

function userSelect() {
  return "id,username,display_name,avatar_url,name_color,role,is_premium,followers_count,following_count,hide_social";
}

async function ensureFollow(followerId, followingId) {
  const { data: existing } = await safe(
    supabase.from("follows").select("follower_id").eq("follower_id", followerId).eq("following_id", followingId).maybeSingle(),
    { data: null },
  );
  if (existing) return false;
  await safe(supabase.from("follows").insert({ follower_id: followerId, following_id: followingId }));
  const [{ data: follower }, { data: following }] = await Promise.all([
    safe(supabase.from("users").select("following_count").eq("id", followerId).single(), { data: null }),
    safe(supabase.from("users").select("followers_count").eq("id", followingId).single(), { data: null }),
  ]);
  await safe(supabase.from("users").update({ following_count: (follower?.following_count ?? 0) + 1 }).eq("id", followerId));
  await safe(supabase.from("users").update({ followers_count: (following?.followers_count ?? 0) + 1 }).eq("id", followingId));
  return true;
}

async function removeFollow(followerId, followingId) {
  const { data: existing } = await safe(
    supabase.from("follows").select("follower_id").eq("follower_id", followerId).eq("following_id", followingId).maybeSingle(),
    { data: null },
  );
  if (!existing) return false;
  await safe(supabase.from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId));
  const [{ data: follower }, { data: following }] = await Promise.all([
    safe(supabase.from("users").select("following_count").eq("id", followerId).single(), { data: null }),
    safe(supabase.from("users").select("followers_count").eq("id", followingId).single(), { data: null }),
  ]);
  await safe(supabase.from("users").update({ following_count: Math.max(0, (follower?.following_count ?? 0) - 1) }).eq("id", followerId));
  await safe(supabase.from("users").update({ followers_count: Math.max(0, (following?.followers_count ?? 0) - 1) }).eq("id", followingId));
  return true;
}

async function setFriendship(a, b, status) {
  await safe(supabase.from("friendships").upsert({ user_id: a, friend_id: b, status }, { onConflict: "user_id,friend_id" }));
}

router.get("/circles", async (req, res) => {
  const { data, error } = await safe(
    supabase
      .from("user_circles")
      .select("*, members:user_circle_members(user:users(id,username,display_name,avatar_url,name_color,role,is_premium))")
      .eq("owner_id", req.userId)
      .order("created_at", { ascending: true }),
    { data: [], error: null },
  );
  if (error) return res.json([]);
  res.json((data || []).map((circle) => ({
    id: circle.id,
    name: circle.name,
    color: circle.color,
    createdAt: circle.created_at,
    members: (circle.members || []).map((m) => m.user).filter(Boolean),
  })));
});

router.post("/circles", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40);
  const color = String(req.body.color || "#a855f7").slice(0, 24);
  if (!name) return res.status(400).json({ error: "Circle name required" });
  const { data, error } = await safe(
    supabase.from("user_circles").insert({ owner_id: req.userId, name, color }).select("*").single(),
    { data: null, error: null },
  );
  if (error) return res.status(503).json({ error: "Run user_circles migration", detail: error.message });
  res.status(201).json({ id: data.id, name: data.name, color: data.color, members: [], createdAt: data.created_at });
});

router.patch("/circles/:id", async (req, res) => {
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim().slice(0, 40);
  if (req.body.color !== undefined) patch.color = String(req.body.color).slice(0, 24);
  const { data, error } = await safe(
    supabase.from("user_circles").update(patch).eq("id", req.params.id).eq("owner_id", req.userId).select("*").single(),
    { data: null, error: null },
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ id: data.id, name: data.name, color: data.color, createdAt: data.created_at });
});

router.delete("/circles/:id", async (req, res) => {
  await safe(supabase.from("user_circles").delete().eq("id", req.params.id).eq("owner_id", req.userId));
  res.json({ ok: true });
});

router.post("/circles/:id/members", async (req, res) => {
  const { userId } = req.body;
  if (!userId || userId === req.userId) return res.status(400).json({ error: "Invalid user" });
  const { data: circle } = await safe(supabase.from("user_circles").select("id").eq("id", req.params.id).eq("owner_id", req.userId).maybeSingle(), { data: null });
  if (!circle) return res.status(404).json({ error: "Circle not found" });
  const { error } = await safe(
    supabase.from("user_circle_members").upsert({ circle_id: req.params.id, user_id: userId }, { onConflict: "circle_id,user_id" }),
    { error: null },
  );
  if (error) return res.status(503).json({ error: "Run user_circle_members migration", detail: error.message });
  res.json({ ok: true });
});

router.delete("/circles/:id/members/:userId", async (req, res) => {
  const { data: circle } = await safe(supabase.from("user_circles").select("id").eq("id", req.params.id).eq("owner_id", req.userId).maybeSingle(), { data: null });
  if (!circle) return res.status(404).json({ error: "Circle not found" });
  await safe(supabase.from("user_circle_members").delete().eq("circle_id", req.params.id).eq("user_id", req.params.userId));
  res.json({ ok: true });
});

router.get("/", async (req, res) => {
  const [friendsRes, followingRes, favoritesRes, blockedRes, groupsRes, channelsRes] = await Promise.all([
    safe(supabase.from("friendships").select(`friend:users!friendships_friend_id_fkey(${userSelect()})`).eq("user_id", req.userId).eq("status", "accepted")),
    safe(supabase.from("follows").select(`following:users!follows_following_id_fkey(${userSelect()})`).eq("follower_id", req.userId)),
    safe(supabase.from("favorite_users").select(`target:users!favorite_users_target_id_fkey(${userSelect()})`).eq("user_id", req.userId)),
    safe(supabase.from("user_blocks").select(`target:users!user_blocks_blocked_id_fkey(${userSelect()})`).eq("user_id", req.userId)),
    safe(supabase.from("conversation_participants").select("conversations(*)").eq("user_id", req.userId)),
    safe(supabase.from("channels").select("*").eq("owner_id", req.userId)),
  ]);

  res.json({
    friends: (friendsRes.data || []).map((r) => r.friend).filter(Boolean),
    following: (followingRes.data || []).map((r) => r.following).filter(Boolean),
    favorites: (favoritesRes.data || []).map((r) => r.target).filter(Boolean),
    blocked: (blockedRes.data || []).map((r) => r.target).filter(Boolean),
    groups: (groupsRes.data || []).map((r) => r.conversations).filter((c) => c && c.type === "group"),
    channels: channelsRes.data || [],
  });
});

router.get("/:username", async (req, res) => {
  const { data: target } = await safe(
    supabase.from("users").select("id,hide_social").eq("username", req.params.username).maybeSingle(),
    { data: null, error: null },
  );
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.hide_social && target.id !== req.userId) {
    return res.json({ hidden: true, friends: [], channels: [] });
  }

  const [friendsRes, channelsRes] = await Promise.all([
    safe(supabase.from("friendships").select(`friend:users!friendships_friend_id_fkey(${userSelect()})`).eq("user_id", target.id).eq("status", "accepted")),
    safe(supabase.from("channel_subscriptions").select("channels(*)").eq("user_id", target.id)),
  ]);

  res.json({
    hidden: false,
    friends: (friendsRes.data || []).map((r) => r.friend).filter(Boolean),
    channels: (channelsRes.data || []).map((r) => r.channels).filter(Boolean),
  });
});

router.post("/friend", async (req, res) => {
  const { userId } = req.body;
  if (!userId || userId === req.userId) return res.status(400).json({ error: "Invalid user" });

  const { data: existingFollow } = await safe(
    supabase.from("follows").select("follower_id").eq("follower_id", req.userId).eq("following_id", userId).maybeSingle(),
    { data: null },
  );

  if (existingFollow) {
    await removeFollow(req.userId, userId);
    await safe(supabase.from("friendships").delete().eq("user_id", req.userId).eq("friend_id", userId));
    return res.json({ ok: true, active: false, friends: false });
  }

  await ensureFollow(req.userId, userId);

  const { data: reverseFollow } = await safe(
    supabase.from("follows").select("follower_id").eq("follower_id", userId).eq("following_id", req.userId).maybeSingle(),
    { data: null },
  );

  if (reverseFollow) {
    await setFriendship(req.userId, userId, "accepted");
    await setFriendship(userId, req.userId, "accepted");
    await pushNotification(req, userId, {
      type: "follow",
      title: "Вы теперь друзья",
      body: `@${req.username || "user"} добавил вас в ответ`,
      actor_id: req.userId,
      action_type: null,
      read: false,
    });
    return res.json({ ok: true, active: true, friends: true });
  }

  await setFriendship(req.userId, userId, "pending");
  await pushNotification(req, userId, {
    type: "follow",
    title: "Новый подписчик",
    body: `@${req.username || "user"} подписался на вас`,
    actor_id: req.userId,
    action_type: "follow_back",
    read: false,
  });
  res.json({ ok: true, active: true, friends: false });
});

async function togglePair(table, userColumn, targetColumn, req, res, extra = {}) {
  const { userId } = req.body;
  if (!userId || userId === req.userId) return res.status(400).json({ error: "Invalid user" });

  const { data: existing } = await safe(
    supabase.from(table).select(userColumn).eq(userColumn, req.userId).eq(targetColumn, userId).maybeSingle(),
    { data: null },
  );

  if (existing) {
    await safe(supabase.from(table).delete().eq(userColumn, req.userId).eq(targetColumn, userId));
    return res.json({ ok: true, active: false });
  }

  const { error } = await safe(
    supabase.from(table).insert({ [userColumn]: req.userId, [targetColumn]: userId, ...extra }),
    { error: null },
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, active: true });
}

router.post("/favorite", async (req, res) => {
  await togglePair("favorite_users", "user_id", "target_id", req, res);
});

router.post("/block", async (req, res) => {
  await togglePair("user_blocks", "user_id", "blocked_id", req, res);
});

module.exports = { socialRouter: router };
