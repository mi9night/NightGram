// =============================================================================
//  Socket.io — real-time messaging, presence, post events
//  Authenticates via the JWT passed in `auth.token`.
// =============================================================================

const { verifyAccessToken } = require("./lib/jwt");
const { supabase } = require("./lib/supabase");

function setupSocket(io) {
  // Auth middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.sub;
      socket.username = payload.username;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Join personal room (used for webhook-driven events like premium/coins updates)
    socket.join(`user:${socket.userId}`);

    // Mark online
    supabase
      .from("presence")
      .upsert({ user_id: socket.userId, is_online: true, last_seen: new Date().toISOString() });

    // ---- Messaging ----
    socket.on("message:send", async (payload, ack) => {
      const { conversationId, text, type, attachmentUrl, replyTo } = payload;

      // Verify the sender is a participant
      const { data: part } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("user_id", socket.userId)
        .maybeSingle();
      if (!part) return ack?.({ error: "Not a participant" });

      const { data: msg, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: socket.userId,
          text,
          type: type || "text",
          attachment_url: attachmentUrl,
          reply_to: replyTo,
          status: "sent",
        })
        .select("*")
        .single();
      if (error) return ack?.({ error: error.message });

      // Broadcast to everyone in the conversation room
      io.to(`conv:${conversationId}`).emit("message:new", msg);
      ack?.({ ok: true, id: msg.id });
    });

    // Join a conversation room
    socket.on("conversation:join", (conversationId) => {
      socket.join(`conv:${conversationId}`);
    });

    socket.on("message:react", async ({ messageId, emoji }) => {
      await supabase
        .from("message_reactions")
        .upsert({ message_id: messageId, user_id: socket.userId, emoji }, { onConflict: "message_id,user_id,emoji" });
      // Echo to conversation rooms (lookup conv id in a fuller impl)
      socket.broadcast.emit("message:reaction", { messageId, emoji, userId: socket.userId });
    });

    socket.on("typing", ({ conversationId, isTyping }) => {
      socket.to(`conv:${conversationId}`).emit("typing", {
        conversationId,
        userId: socket.userId,
        isTyping,
      });
    });

    // ---- Posts ----
    socket.on("post:like", ({ postId, liked }) => {
      socket.broadcast.emit("post:like", { postId, userId: socket.userId, liked });
    });

    // ---- Presence ----
    socket.on("presence:ping", () => {
      supabase
        .from("presence")
        .update({ last_seen: new Date().toISOString() })
        .eq("user_id", socket.userId);
    });

    socket.on("disconnect", () => {
      supabase
        .from("presence")
        .upsert({ user_id: socket.userId, is_online: false, last_seen: new Date().toISOString() });
    });
  });
}

module.exports = { setupSocket };
