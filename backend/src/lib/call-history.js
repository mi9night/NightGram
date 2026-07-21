const { supabase } = require("./supabase");

function nowIso() {
  return new Date().toISOString();
}

async function createCallHistory({ callId, conversationId, initiatorId, initiatorUsername, type, participantIds, conversationTitle, avatarUrl }) {
  const ids = [...new Set((participantIds || []).filter(Boolean))];
  if (!callId || !conversationId || !initiatorId || ids.length < 2) return;
  const startedAt = nowIso();
  const rows = ids.map((userId) => ({
    call_id: callId,
    conversation_id: conversationId,
    user_id: userId,
    initiator_id: initiatorId,
    direction: userId === initiatorId ? "outgoing" : "incoming",
    call_type: type === "video" ? "video" : "audio",
    is_group: ids.length > 2,
    status: "ringing",
    conversation_title: conversationTitle || null,
    avatar_url: avatarUrl || null,
    initiator_username: initiatorUsername || null,
    participant_ids: ids,
    started_at: startedAt,
    updated_at: startedAt,
  }));
  const { error } = await supabase.from("call_history").upsert(rows, { onConflict: "call_id,user_id" });
  if (error && !/call_history|schema cache|does not exist/i.test(error.message || "")) {
    console.error("[CallHistory] create", error.message || error);
  }
}

async function markParticipantAccepted(callId, userId) {
  if (!callId || !userId) return;
  const timestamp = nowIso();
  const updates = [
    supabase.from("call_history").update({ status: "active", answered_at: timestamp, updated_at: timestamp }).eq("call_id", callId).eq("user_id", userId).eq("status", "ringing"),
    supabase.from("call_history").update({ status: "active", answered_at: timestamp, updated_at: timestamp }).eq("call_id", callId).eq("direction", "outgoing").eq("status", "ringing"),
  ];
  const results = await Promise.all(updates);
  for (const result of results) {
    if (result.error && !/call_history|schema cache|does not exist/i.test(result.error.message || "")) console.error("[CallHistory] accept", result.error.message || result.error);
  }
}

async function markParticipantRejected(callId, userId) {
  if (!callId || !userId) return;
  const timestamp = nowIso();
  const { error } = await supabase
    .from("call_history")
    .update({ status: "rejected", ended_at: timestamp, duration_sec: 0, updated_at: timestamp })
    .eq("call_id", callId)
    .eq("user_id", userId)
    .eq("status", "ringing");
  if (error && !/call_history|schema cache|does not exist/i.test(error.message || "")) console.error("[CallHistory] reject", error.message || error);
}

async function markParticipantLeft(callId, userId) {
  if (!callId || !userId) return;
  const endedAt = nowIso();
  const { data } = await supabase.from("call_history").select("answered_at,status").eq("call_id", callId).eq("user_id", userId).maybeSingle();
  const answeredAt = data?.answered_at ? new Date(data.answered_at).getTime() : null;
  const duration = answeredAt ? Math.max(0, Math.floor((Date.now() - answeredAt) / 1000)) : 0;
  const status = data?.status === "active" ? "completed" : "cancelled";
  const { error } = await supabase.from("call_history").update({ status, ended_at: endedAt, duration_sec: duration, updated_at: endedAt }).eq("call_id", callId).eq("user_id", userId);
  if (error && !/call_history|schema cache|does not exist/i.test(error.message || "")) console.error("[CallHistory] leave", error.message || error);
}

async function finishCallHistory(callId, reason = "ended") {
  if (!callId) return;
  const { data: rows, error } = await supabase.from("call_history").select("id,status,direction,answered_at").eq("call_id", callId);
  if (error) {
    if (!/call_history|schema cache|does not exist/i.test(error.message || "")) console.error("[CallHistory] finish-read", error.message || error);
    return;
  }
  const endedAt = nowIso();
  const answeredAny = (rows || []).some((row) => row.status === "active" || row.status === "completed" || Boolean(row.answered_at));
  await Promise.all((rows || []).map((row) => {
    const answeredAt = row.answered_at ? new Date(row.answered_at).getTime() : null;
    const duration = answeredAt ? Math.max(0, Math.floor((Date.now() - answeredAt) / 1000)) : 0;
    let status = row.status;
    if (row.status === "active") status = "completed";
    else if (row.status === "ringing") {
      if (reason === "rejected") status = row.direction === "incoming" ? "rejected" : "cancelled";
      else if (reason === "missed" || reason === "empty" || answeredAny) status = row.direction === "incoming" ? "missed" : "cancelled";
      else status = "cancelled";
    }
    return supabase.from("call_history").update({ status, ended_at: endedAt, duration_sec: duration, updated_at: endedAt }).eq("id", row.id);
  }));
}

module.exports = {
  createCallHistory,
  markParticipantAccepted,
  markParticipantRejected,
  markParticipantLeft,
  finishCallHistory,
};
