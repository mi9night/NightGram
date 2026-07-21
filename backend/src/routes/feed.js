// Feed routes — cursor-paginated infinite feed
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

async function safe(promise, fallback = { data: null, error: null }) {
  try { return await promise; } catch (error) { return { ...fallback, error }; }
}

const PUBLIC_USER_SELECT = "id,username,display_name,avatar_url,name_color,role,is_premium,avatar_frame";

async function canViewPost(post, viewerId) {
  if (!post.author_user_id || post.author_user_id === viewerId) return true;
  const visibility = post.visibility || "public";
  if (visibility === "public") return true;
  if (visibility === "followers") {
    const { data } = await safe(
      supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", post.author_user_id).maybeSingle(),
      { data: null, error: null },
    );
    return Boolean(data);
  }
  if (visibility === "circle" && post.circle_id) {
    const { data } = await safe(
      supabase.from("user_circle_members").select("circle_id").eq("circle_id", post.circle_id).eq("user_id", viewerId).maybeSingle(),
      { data: null, error: null },
    );
    return Boolean(data);
  }
  return false;
}

// GET /api/feed?cursor=&limit=
router.get("/", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 30);
  const cursor = req.query.cursor || null;

  let query = supabase
    .from("posts")
    .select(
      "id,text,tags,likes_count,comments_count,views_count,shares_count,created_at,author_user_id,author_channel_id,visibility,circle_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(90, limit * 4));

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const visible = [];
  for (const post of data || []) {
    if (await canViewPost(post, req.userId)) visible.push(post);
    if (visible.length >= limit + 1) break;
  }
  const hasMore = visible.length > limit || (data || []).length >= Math.min(90, limit * 4);
  const posts = visible.slice(0, limit);
  const nextCursor = posts.length > 0 ? posts[posts.length - 1].created_at : null;

  // Hydrate authors + media + engagement flags
  const userIds = [...new Set(posts.map((p) => p.author_user_id).filter(Boolean))];
  const channelIds = [...new Set(posts.map((p) => p.author_channel_id).filter(Boolean))];
  const [users, channels, channelRoles, media, likes, saves] = await Promise.all([
    userIds.length
      ? supabase.from("users").select(PUBLIC_USER_SELECT).in("id", userIds)
      : Promise.resolve({ data: [] }),
    channelIds.length
      ? supabase.from("channels").select("*").in("id", channelIds)
      : Promise.resolve({ data: [] }),
    channelIds.length
      ? supabase.from("channel_roles").select("channel_id,role").eq("user_id", req.userId).in("channel_id", channelIds)
      : Promise.resolve({ data: [] }),
    posts.length
      ? supabase.from("post_media").select("*").in("post_id", posts.map((p) => p.id))
      : Promise.resolve({ data: [] }),
    posts.length
      ? supabase.from("post_likes").select("post_id").eq("user_id", req.userId).in("post_id", posts.map((p) => p.id))
      : Promise.resolve({ data: [] }),
    posts.length
      ? supabase.from("post_saves").select("post_id").eq("user_id", req.userId).in("post_id", posts.map((p) => p.id))
      : Promise.resolve({ data: [] }),
  ]);

  const userMap = Object.fromEntries((users.data || []).map((u) => [u.id, u]));
  const channelMap = Object.fromEntries((channels.data || []).map((c) => [c.id, c]));
  const channelRoleMap = Object.fromEntries((channelRoles.data || []).map((r) => [r.channel_id, r.role]));
  const likedSet = new Set((likes.data || []).map((l) => l.post_id));
  const savedSet = new Set((saves.data || []).map((s) => s.post_id));
  const mediaByPost = (media.data || []).reduce((acc, m) => {
    (acc[m.post_id] = acc[m.post_id] || []).push(m);
    return acc;
  }, {});

  const out = posts.map((p) => ({
    id: p.id,
    author: p.author_user_id
      ? { kind: "user", user: userMap[p.author_user_id] }
      : { kind: "channel", channel: {
          id: p.author_channel_id,
          name: channelMap[p.author_channel_id]?.name || "Канал",
          handle: channelMap[p.author_channel_id]?.handle || "channel",
          avatarUrl: channelMap[p.author_channel_id]?.avatar_url || null,
          description: channelMap[p.author_channel_id]?.description || "",
          subscribersCount: channelMap[p.author_channel_id]?.subscribers_count || 0,
          verified: channelMap[p.author_channel_id]?.verified || false,
          ownerId: channelMap[p.author_channel_id]?.owner_id,
          myRole: channelMap[p.author_channel_id]?.owner_id === req.userId ? "owner" : (channelRoleMap[p.author_channel_id] || null),
          isPrivate: channelMap[p.author_channel_id]?.is_private || false,
          commentsEnabled: channelMap[p.author_channel_id]?.comments_enabled !== false,
          commentSlowModeSeconds: Math.max(0, Number(channelMap[p.author_channel_id]?.comment_slow_mode_seconds || 0)),
          boostColor: channelMap[p.author_channel_id]?.boost_color || null,
          boostGlow: channelMap[p.author_channel_id]?.boost_glow || null,
          boostAvatarFrame: channelMap[p.author_channel_id]?.boost_avatar_frame || null,
        } },
    text: p.text,
    media: mediaByPost[p.id] || [],
    tags: p.tags || [],
    likesCount: p.likes_count,
    commentsCount: p.comments_count,
    viewsCount: p.views_count,
    sharesCount: p.shares_count,
    visibility: p.visibility || "public",
    circleId: p.circle_id || null,
    liked: likedSet.has(p.id),
    saved: savedSet.has(p.id),
    createdAt: p.created_at,
  }));

  res.json({ posts: out, nextCursor });
});

module.exports = { feedRouter: router };
