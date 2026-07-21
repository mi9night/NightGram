const assert = require("node:assert/strict");
const {
  MAX_GROUP_CALL_PARTICIPANTS,
  createCallRoom,
  acceptParticipant,
  rejectParticipant,
  leaveParticipant,
} = require("../backend/src/lib/call-room-state");

const participants = ["owner", "u2", "u3", "u4"];
const room = createCallRoom({
  conversationId: "conv-1",
  callerId: "owner",
  callerUsername: "owner",
  type: "video",
  participantIds: participants,
  conversationTitle: "Group",
  avatarUrl: null,
});
assert.equal(MAX_GROUP_CALL_PARTICIPANTS, 8);
assert.deepEqual([...room.joinedUserIds], ["owner"]);

const u2 = acceptParticipant(room, "u2", 1000);
assert.equal(u2.ok, true);
assert.equal(u2.wasJoined, false);
assert.deepEqual(u2.joinedParticipantIds, ["owner", "u2"]);
assert.equal(room.startedAt, 1000);

const u3 = acceptParticipant(room, "u3", 2000);
assert.deepEqual(u3.joinedParticipantIds, ["owner", "u2", "u3"]);
assert.equal(room.startedAt, 1000, "start time must stay at first acceptance");

const left = leaveParticipant(room, "u2");
assert.equal(left.ok, true);
assert.deepEqual(left.joinedParticipantIds, ["owner", "u3"]);
assert.equal(left.empty, false);

const rejectAfterJoin = rejectParticipant(room, "u4");
assert.equal(rejectAfterJoin.shouldFinish, false, "one rejection must not end an active group call");

const direct = createCallRoom({
  conversationId: "conv-2",
  callerId: "owner",
  type: "audio",
  participantIds: ["owner", "peer"],
});
assert.equal(rejectParticipant(direct, "peer").shouldFinish, true);

assert.throws(() => createCallRoom({
  conversationId: "too-big",
  callerId: "u0",
  participantIds: Array.from({ length: 9 }, (_, index) => `u${index}`),
}), /group_call_too_large/);

console.log("Call room state transitions passed.");
