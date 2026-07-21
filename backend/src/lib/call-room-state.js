const MAX_GROUP_CALL_PARTICIPANTS = 8;

function createCallRoom({
  conversationId,
  callerId,
  callerUsername,
  type,
  participantIds,
  conversationTitle,
  avatarUrl,
  timeout,
}) {
  const uniqueParticipants = [...new Set((participantIds || []).filter(Boolean))];
  if (!uniqueParticipants.includes(callerId)) uniqueParticipants.unshift(callerId);
  if (uniqueParticipants.length < 2) throw new Error("not_enough_participants");
  if (uniqueParticipants.length > MAX_GROUP_CALL_PARTICIPANTS) throw new Error("group_call_too_large");
  return {
    conversationId,
    callerId,
    callerUsername,
    type: type === "video" ? "video" : "audio",
    startedAt: null,
    createdAt: Date.now(),
    timeout: timeout || null,
    participantIds: uniqueParticipants,
    joinedUserIds: new Set([callerId]),
    rejectedUserIds: new Set(),
    conversationTitle,
    avatarUrl,
  };
}

function acceptParticipant(call, userId, now = Date.now()) {
  if (!call?.participantIds.includes(userId)) return { ok: false, error: "not_participant" };
  const wasJoined = call.joinedUserIds.has(userId);
  call.joinedUserIds.add(userId);
  call.rejectedUserIds.delete(userId);
  if (!call.startedAt) call.startedAt = now;
  return { ok: true, wasJoined, joinedParticipantIds: [...call.joinedUserIds] };
}

function rejectParticipant(call, userId) {
  if (!call?.participantIds.includes(userId)) return { ok: false, error: "not_participant" };
  call.rejectedUserIds.add(userId);
  const invitees = call.participantIds.filter((id) => id !== call.callerId);
  const nobodyJoined = call.joinedUserIds.size <= 1;
  const everyoneRejected = invitees.every((id) => call.rejectedUserIds.has(id));
  return {
    ok: true,
    shouldFinish: call.participantIds.length === 2 || (nobodyJoined && everyoneRejected),
  };
}

function leaveParticipant(call, userId) {
  if (!call?.joinedUserIds.has(userId)) return { ok: false, joinedParticipantIds: call ? [...call.joinedUserIds] : [] };
  call.joinedUserIds.delete(userId);
  return { ok: true, joinedParticipantIds: [...call.joinedUserIds], empty: call.joinedUserIds.size === 0 };
}

module.exports = {
  MAX_GROUP_CALL_PARTICIPANTS,
  createCallRoom,
  acceptParticipant,
  rejectParticipant,
  leaveParticipant,
};
