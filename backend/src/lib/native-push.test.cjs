const assert = require("node:assert/strict");
const { compactPayload, nativePushConfig } = require("./native-push");
const { quietHoursActive, categoryEnabled, shouldDeliver } = require("./push-rules");

assert.deepEqual(compactPayload({ a: 1, b: true, c: { ok: true }, d: null }), { a: "1", b: "true", c: '{"ok":true}' });
assert.equal(typeof nativePushConfig().android, "boolean");
assert.equal(typeof nativePushConfig().ios, "boolean");
assert.equal(categoryEnabled({ push: true, messages: true, directMessages: true }, "direct"), true);
assert.equal(categoryEnabled({ push: false }, "call"), false);
assert.equal(quietHoursActive({ quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "08:00" }, 0, new Date("2026-01-01T23:00:00Z")), true);
assert.equal(shouldDeliver({ push: true, messages: true, mentions: true, quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "08:00", quietHoursAllowMentions: true }, 0, "mention", false, new Date("2026-01-01T23:00:00Z")), true);
console.log("Native push rules: passed");
