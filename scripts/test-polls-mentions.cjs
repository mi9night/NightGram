const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "./supabase" && parent?.filename?.endsWith("pollsMentions.js")) {
    return { supabase: {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { extractMentionUsernames, serializePoll } = require("../backend/src/lib/pollsMentions");
Module._load = originalLoad;

assert.deepEqual(
  extractMentionUsernames("Привет @Alice, @bob и снова @alice. email@test.com не считается"),
  ["alice", "bob"],
);

const poll = serializePoll(
  { id: "p1", question: "Выбор?", allow_multiple: true, anonymous: false, closed_at: null },
  [
    { id: "o2", text: "B", position: 1 },
    { id: "o1", text: "A", position: 0 },
  ],
  [
    { poll_id: "p1", option_id: "o1", user_id: "u1" },
    { poll_id: "p1", option_id: "o2", user_id: "u1" },
    { poll_id: "p1", option_id: "o2", user_id: "u2" },
  ],
  "u1",
);
assert.equal(poll.totalVotes, 2);
assert.deepEqual(poll.myOptionIds.sort(), ["o1", "o2"]);
assert.equal(poll.options[0].id, "o1");
assert.equal(poll.options[1].votesCount, 2);
assert.deepEqual(poll.options[1].voterIds.sort(), ["u1", "u2"]);

const anonymous = serializePoll(
  { id: "p2", question: "Secret?", allow_multiple: false, anonymous: true, closed_at: null },
  [{ id: "a1", text: "Да", position: 0 }],
  [{ poll_id: "p2", option_id: "a1", user_id: "u3" }],
  "u4",
);
assert.equal("voterIds" in anonymous.options[0], false);

console.log("[OK] Poll and mention pure logic tests passed.");
