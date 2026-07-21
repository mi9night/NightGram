const assert = require("node:assert/strict");
const { clampRingTimeoutSeconds, busyParticipantIds, admitCall } = require("../backend/src/lib/call-admission");

const activeCalls = new Map([
  ["call-a", { participantIds: ["owner-a", "busy-user"], joinedUserIds: new Set(["owner-a", "busy-user"]) }],
  ["call-b", { participantIds: ["ringing-owner", "ringing-user"], joinedUserIds: new Set(["ringing-owner"]) }],
]);

assert.equal(clampRingTimeoutSeconds(undefined), 60);
assert.equal(clampRingTimeoutSeconds(2), 15);
assert.equal(clampRingTimeoutSeconds(999), 120);
assert.deepEqual(new Set(busyParticipantIds(activeCalls, ["free", "busy-user", "ringing-user"])), new Set(["busy-user", "ringing-user"]));

const directBusy = admitCall(activeCalls, ["caller", "busy-user"], "caller");
assert.equal(directBusy.ok, false);
assert.equal(directBusy.error, "participant_busy");

const callerBusy = admitCall(activeCalls, ["owner-a", "free"], "owner-a");
assert.equal(callerBusy.ok, false);
assert.equal(callerBusy.error, "already_in_call");

const group = admitCall(activeCalls, ["caller", "free", "busy-user", "free-2"], "caller");
assert.equal(group.ok, true);
assert.deepEqual(group.participantIds, ["caller", "free", "free-2"]);
assert.deepEqual(group.busyParticipantIds, ["busy-user"]);

console.log("Call admission and busy-user protection passed.");
