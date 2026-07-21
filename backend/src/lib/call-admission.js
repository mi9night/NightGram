function clampRingTimeoutSeconds(value, fallback = 60) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(120, Math.max(15, parsed));
}

function busyParticipantIds(activeCalls, participantIds, exceptCallId = null) {
  const busy = new Set();
  const requested = new Set((participantIds || []).filter(Boolean));
  for (const [callId, call] of activeCalls || []) {
    if (exceptCallId && callId === exceptCallId) continue;
    for (const userId of call?.participantIds || []) {
      if (requested.has(userId)) busy.add(userId);
    }
  }
  return [...busy];
}

function admitCall(activeCalls, participantIds, callerId) {
  const unique = [...new Set((participantIds || []).filter(Boolean))];
  const busy = new Set(busyParticipantIds(activeCalls, unique));
  if (busy.has(callerId)) return { ok: false, error: "already_in_call", participantIds: [], busyParticipantIds: [...busy] };
  const available = unique.filter((userId) => userId === callerId || !busy.has(userId));
  if (available.length < 2) return { ok: false, error: "participant_busy", participantIds: available, busyParticipantIds: [...busy] };
  return { ok: true, participantIds: available, busyParticipantIds: [...busy] };
}

module.exports = { clampRingTimeoutSeconds, busyParticipantIds, admitCall };
