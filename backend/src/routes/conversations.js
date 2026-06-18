// Conversations routes — list + message history
const router = require("express").Router();
const { supabase } = require("../lib/supabase");

// GET /api/conversations
router.get("/", async (req, res) => {
  const { data: parts, error } = await supabase
    .from("conversation_participants")
    .select("conversation_id, role, pinned, last_read_at, conversations(*)")
    .eq("user_id", req.userId);
  if (error) return res.status(500).json({ error: error.message });

  // Hydrate participants + last message + unread counts per conversation
  const convIds = (parts || []).map((p) => p.conversation_id);
  const [{ data: allParts }, { data: msgs }] = await Promise.all([
    convIds.length
      ? supabase.from("conversation_participants").select("*, users(*)").in("conversation_id", convIds)
      : Promise.resolve({ data: [] }),
    convIds.length
      ? supabase.from("messages").select("*").in("conversation_id", convIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const result = convIds.map((cid) => {
    const cp = parts.find((p) => p.conversation_id === cid);
    const participants = (allParts || [])
      .filter((p) => p.conversation_id === cid)
      .map((p) => ({
        id: p.users.id,
        username: p.users.username,
        avatarUrl: p.users.avatar_url,
        nameColor: p.users.name_color,
        role: p.role,
        isOnline: false,
      }));
    const convMsgs = (msgs || []).filter((m) => m.conversation_id === cid);
    const lastMessage = convMsgs[0] || null;
    const unread = lastMessage && cp.last_read_at
      ? convMsgs.filter((m) => new Date(m.created_at) > new Date(cp.last_read_at)).length
      : 0;
    return {
      id: cid,
      type: cp.conversations.type,
      title: cp.conversations.title,
      avatarUrl: cp.conversations.avatar_url,
      participants,
      lastMessage,
      unreadCount: unread,
      pinned: cp.pinned,
      folder: "all",
    };
  });

  res.json(result);
});

// GET /api/conversations/:id/messages
router.get("/:id/messages", async (req, res) => {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", req.params.id)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

module.exports = { conversationsRouter: router };
