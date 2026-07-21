// =============================================================================
//  Message receipts — per-recipient delivered/read persistence for Messenger
//  Falls back silently when the optional migration is not installed yet.
// =============================================================================

const { supabase } = require("./supabase");

async function safeQuery(query, fallbackData = null) {
  try {
    const result = await query;
    if (result?.error) return { data: fallbackData, error: result.error };
    return result;
  } catch (error) {
    return { data: fallbackData, error };
  }
}

function isMissingReceiptsTable(error) {
  const message = String(error?.message || error?.details || error || "").toLowerCase();
  return message.includes("message_reads") || message.includes("schema cache") || message.includes("does not exist") || message.includes("42p01");
}

function emptySummary(row) {
  return {
    status: row?.status || "sent",
    readBy: [],
    deliveredTo: [],
  };
}

function computeSummary(row, participantIds, receipts) {
  if (!row) return { status: "sent", readBy: [], deliveredTo: [] };
  const recipients = participantIds.filter((id) => id && id !== row.sender_id);
  const receiptRows = (receipts || []).filter((receipt) => receipt.message_id === row.id);
  const recipientSet = new Set(recipients);

  const readBy = [...new Set(
    receiptRows
      .filter((receipt) => receipt.read_at && recipientSet.has(receipt.user_id))
      .map((receipt) => receipt.user_id),
  )];
  const deliveredTo = [...new Set(
    receiptRows
      .filter((receipt) => (receipt.delivered_at || receipt.read_at) && recipientSet.has(receipt.user_id))
      .map((receipt) => receipt.user_id),
  )];

  let status = row.status || "sent";
  if (recipients.length === 0) {
    status = "read";
  } else if (readBy.length >= recipients.length) {
    status = "read";
  } else if (deliveredTo.length >= recipients.length) {
    status = "delivered";
  } else if (status === "read" && readBy.length < recipients.length) {
    // Old global status could say "read" after only one group member opened the chat.
    // The per-recipient table is the source of truth now.
    status = deliveredTo.length > 0 ? "delivered" : "sent";
  } else if (status === "delivered" && deliveredTo.length === 0) {
    status = "sent";
  }

  return { status, readBy, deliveredTo };
}

async function getReceiptSummaries(rows) {
  const messages = (rows || []).filter(Boolean);
  if (messages.length === 0) return new Map();

  const messageIds = messages.map((row) => row.id).filter(Boolean);
  const conversationIds = [...new Set(messages.map((row) => row.conversation_id).filter(Boolean))];

  const [{ data: receipts, error: receiptsError }, { data: participants }] = await Promise.all([
    messageIds.length
      ? safeQuery(
          supabase
            .from("message_reads")
            .select("message_id,user_id,delivered_at,read_at")
            .in("message_id", messageIds),
          [],
        )
      : Promise.resolve({ data: [] }),
    conversationIds.length
      ? safeQuery(
          supabase
            .from("conversation_participants")
            .select("conversation_id,user_id")
            .in("conversation_id", conversationIds),
          [],
        )
      : Promise.resolve({ data: [] }),
  ]);

  const summaries = new Map();
  if (receiptsError && isMissingReceiptsTable(receiptsError)) {
    for (const row of messages) summaries.set(row.id, emptySummary(row));
    return summaries;
  }

  const participantsByConversation = new Map();
  for (const participant of participants || []) {
    if (!participantsByConversation.has(participant.conversation_id)) {
      participantsByConversation.set(participant.conversation_id, []);
    }
    participantsByConversation.get(participant.conversation_id).push(participant.user_id);
  }

  for (const row of messages) {
    const participantIds = participantsByConversation.get(row.conversation_id) || [];
    summaries.set(row.id, computeSummary(row, participantIds, receipts || []));
  }

  return summaries;
}

async function markMessageReceipt({ messageId, conversationId, userId, read = false }) {
  if (!messageId || !conversationId || !userId) return { ok: false, missing: false };
  const now = new Date().toISOString();

  const { data: existing, error: selectError } = await safeQuery(
    supabase
      .from("message_reads")
      .select("delivered_at,read_at")
      .eq("message_id", messageId)
      .eq("user_id", userId)
      .maybeSingle(),
    null,
  );

  if (selectError && isMissingReceiptsTable(selectError)) return { ok: false, missing: true, error: selectError };

  const payload = {
    message_id: messageId,
    conversation_id: conversationId,
    user_id: userId,
    delivered_at: existing?.delivered_at || now,
    read_at: read ? (existing?.read_at || now) : (existing?.read_at || null),
  };

  const { error } = await safeQuery(
    supabase
      .from("message_reads")
      .upsert(payload, { onConflict: "message_id,user_id" }),
    null,
  );

  if (error && isMissingReceiptsTable(error)) return { ok: false, missing: true, error };
  if (error) return { ok: false, missing: false, error };
  return { ok: true, deliveredAt: payload.delivered_at, readAt: payload.read_at };
}

async function summarizeSingleMessage(messageId) {
  const { data: row } = await safeQuery(
    supabase.from("messages").select("*").eq("id", messageId).maybeSingle(),
    null,
  );
  if (!row) return null;
  const summaries = await getReceiptSummaries([row]);
  return { row, summary: summaries.get(row.id) || emptySummary(row) };
}

module.exports = {
  getReceiptSummaries,
  markMessageReceipt,
  summarizeSingleMessage,
};
