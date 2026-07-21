const { supabase } = require("./supabase");
const { getReceiptSummaries } = require("./messageReceipts");
const { hasActivePunishment } = require("./punishments");
const { assessLinksWithRules, getTrustProfile, hasRestriction } = require("./safety");
const { sendPushToUsers } = require("./push");

const POLL_INTERVAL_MS = 10_000;
const BATCH_SIZE = 25;

function serializeSender(sender, fallbackId = "") {
  if (!sender) return undefined;
  const username = String(sender.username || "");
  const avatarFrame = sender.avatar_frame ?? sender.avatarFrame ?? null;
  return {
    id: String(sender.id || fallbackId || ""),
    username,
    displayName: String(sender.display_name || sender.displayName || username || "Пользователь"),
    avatarUrl: sender.avatar_url ?? sender.avatarUrl ?? null,
    nameColor: String(sender.name_color || sender.nameColor || "#ffffff"),
    isPremium: Boolean(sender.is_premium ?? sender.isPremium ?? false),
    avatarFrame,
    verified: Boolean(sender.verified ?? sender.isVerified ?? avatarFrame === "verified"),
  };
}

function serializeMessage(row, sender, receiptSummary) {
  return {
    ...row,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    sender: serializeSender(sender, row.sender_id),
    attachmentUrl: row.attachment_url ?? undefined,
    attachmentThumbnailUrl: row.attachment_thumbnail_url ?? undefined,
    mediaWidth: row.media_width ?? undefined,
    mediaHeight: row.media_height ?? undefined,
    mediaDurationSec: row.media_duration_sec ?? undefined,
    replyTo: row.reply_to ? { id: row.reply_to, text: "", senderId: "" } : null,
    reactions: [],
    status: receiptSummary?.status || row.status || "sent",
    readBy: receiptSummary?.readBy || [],
    deliveredTo: receiptSummary?.deliveredTo || [],
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
    pinnedAt: row.pinned_at ?? null,
    pinnedBy: row.pinned_by ?? null,
  };
}

async function claimScheduledMessage(id, nowIso) {
  const { data, error } = await supabase
    .from("scheduled_messages")
    .update({ status: "processing", updated_at: nowIso, last_error: null })
    .eq("id", id)
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function emitScheduledMessage(io, scheduled) {
  const membership = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", scheduled.conversation_id)
    .eq("user_id", scheduled.sender_id)
    .maybeSingle();
  if (membership.error || !membership.data) throw new Error("sender_is_not_participant");

  const [ban, muteDm, trust] = await Promise.all([
    hasActivePunishment(scheduled.sender_id, "ban"),
    hasActivePunishment(scheduled.sender_id, "mute_dm"),
    getTrustProfile(scheduled.sender_id),
  ]);
  if (ban || muteDm || hasRestriction(trust, "messagingDisabled")) throw new Error("sender_is_restricted");
  if (scheduled.text) {
    const linkRisk = await assessLinksWithRules(scheduled.text);
    if (linkRisk.blocked.length > 0 || (hasRestriction(trust, "noLinks") && linkRisk.links.length > 0)) {
      throw new Error("scheduled_link_is_restricted");
    }
  }

  const insertPayload = {
    conversation_id: scheduled.conversation_id,
    sender_id: scheduled.sender_id,
    text: scheduled.text || null,
    type: scheduled.type || "text",
    attachment_url: scheduled.attachment_url || null,
    attachment_thumbnail_url: scheduled.attachment_thumbnail_url || null,
    media_width: scheduled.media_width ?? null,
    media_height: scheduled.media_height ?? null,
    media_duration_sec: scheduled.media_duration_sec ?? null,
    reply_to: scheduled.reply_to || null,
    status: "sent",
    client_id: `scheduled:${scheduled.id}`,
  };

  let insertResult = await supabase.from("messages").insert(insertPayload).select("*").single();
  if (insertResult.error && /client_id|schema cache|column .* does not exist/i.test(insertResult.error.message || "")) {
    const { client_id: _clientId, ...legacy } = insertPayload;
    insertResult = await supabase.from("messages").insert(legacy).select("*").single();
  }
  if (insertResult.error) throw insertResult.error;
  const message = insertResult.data;

  let senderResult = await supabase
    .from("users")
    .select("id,username,display_name,avatar_url,name_color,is_premium,avatar_frame,verified")
    .eq("id", scheduled.sender_id)
    .maybeSingle();
  if (senderResult.error && /verified|schema cache/i.test(senderResult.error.message || "")) {
    senderResult = await supabase
      .from("users")
      .select("id,username,display_name,avatar_url,name_color,is_premium,avatar_frame")
      .eq("id", scheduled.sender_id)
      .maybeSingle();
  }

  const receiptSummaries = await getReceiptSummaries([message]);
  const serialized = serializeMessage(message, senderResult.data, receiptSummaries.get(message.id));
  io?.to(`conv:${scheduled.conversation_id}`).emit("message:new", serialized);

  const [{ data: participants }, { data: conversation }] = await Promise.all([
    supabase
      .from("conversation_participants")
      .select("user_id,muted")
      .eq("conversation_id", scheduled.conversation_id),
    supabase
      .from("conversations")
      .select("title,avatar_url,type,channel_id")
      .eq("id", scheduled.conversation_id)
      .maybeSingle(),
  ]);

  const pushRecipientIds = [];
  for (const participant of participants || []) {
    if (participant.user_id === scheduled.sender_id) continue;
    const conversationKind = conversation?.channel_id ? "channel" : (conversation?.type || "group");
    io?.to(`user:${participant.user_id}`).emit("message:push", {
      conversationId: scheduled.conversation_id,
      message: serialized,
      muted: Boolean(participant.muted),
      conversationTitle: conversation?.title || senderResult.data?.display_name || senderResult.data?.username || "Сообщение",
      avatarUrl: conversation?.avatar_url || senderResult.data?.avatar_url || null,
      conversationKind,
    });
    if (!participant.muted) pushRecipientIds.push(participant.user_id);
  }
  if (pushRecipientIds.length) {
    const conversationKind = conversation?.channel_id ? "channel" : (conversation?.type || "group");
    void sendPushToUsers(pushRecipientIds, {
      kind: "message",
      title: conversation?.title || senderResult.data?.display_name || senderResult.data?.username || "NightGram",
      body: "Новое отложенное сообщение",
      url: `/messages?conversation=${encodeURIComponent(scheduled.conversation_id)}`,
      tag: `message:${scheduled.conversation_id}`,
      conversationId: scheduled.conversation_id,
    }, { category: conversationKind === "channel" ? "channel" : conversationKind === "direct" ? "direct" : "group" });
  }

  // Update the sender's chat list too when the active chat is not open.
  io?.to(`user:${scheduled.sender_id}`).emit("message:push", {
    conversationId: scheduled.conversation_id,
    message: serialized,
    muted: true,
    selfScheduled: true,
    conversationTitle: conversation?.title || "Чат",
    avatarUrl: conversation?.avatar_url || null,
    conversationKind: conversation?.channel_id ? "channel" : (conversation?.type || "group"),
  });

  const sentAt = new Date().toISOString();
  await supabase
    .from("scheduled_messages")
    .update({
      status: "sent",
      sent_at: sentAt,
      sent_message_id: message.id,
      updated_at: sentAt,
      last_error: null,
    })
    .eq("id", scheduled.id)
    .eq("status", "processing");

  io?.to(`user:${scheduled.sender_id}`).emit("scheduled:sent", {
    scheduledId: scheduled.id,
    conversationId: scheduled.conversation_id,
    message: serialized,
    sentAt,
  });
}

async function processDueScheduledMessages(io) {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleProcessingBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  await supabase
    .from("scheduled_messages")
    .update({ status: "pending", updated_at: nowIso })
    .eq("status", "processing")
    .lt("updated_at", staleProcessingBefore);

  const { data, error } = await supabase
    .from("scheduled_messages")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    if (!/scheduled_messages|schema cache|relation .* does not exist/i.test(error.message || "")) {
      console.error("[ScheduledMessages] Query failed:", error.message);
    }
    return;
  }

  for (const row of data || []) {
    let scheduled = null;
    try {
      scheduled = await claimScheduledMessage(row.id, nowIso);
      if (!scheduled) continue;
      await emitScheduledMessage(io, scheduled);
    } catch (error) {
      console.error("[ScheduledMessages] Send failed:", error?.message || error);
      if (scheduled?.id) {
        await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            last_error: String(error?.message || "send_failed").slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", scheduled.id)
          .eq("status", "processing");
        io?.to(`user:${scheduled.sender_id}`).emit("scheduled:failed", {
          scheduledId: scheduled.id,
          conversationId: scheduled.conversation_id,
          message: "Не удалось отправить запланированное сообщение",
        });
      }
    }
  }
}

function startScheduledMessages(io) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await processDueScheduledMessages(io); } finally { running = false; }
  };
  const startupTimer = setTimeout(() => void tick(), 5_000);
  startupTimer.unref?.();
  const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
  interval.unref?.();
  console.log("[NightGram] Scheduled messages worker started ✓");
  return () => {
    clearTimeout(startupTimer);
    clearInterval(interval);
  };
}

module.exports = { startScheduledMessages, processDueScheduledMessages };
