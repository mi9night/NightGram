const { sendWebPushToUsers } = require("./web-push");
const { sendNativePushToUsers } = require("./native-push");

async function sendPushToUsers(userIds, payload, options) {
  const [web, native] = await Promise.all([
    sendWebPushToUsers(userIds, payload, options),
    sendNativePushToUsers(userIds, payload, options),
  ]);
  return {
    configured: Boolean(web.configured || native.configured?.enabled),
    sent: Number(web.sent || 0) + Number(native.sent || 0),
    failed: Number(web.failed || 0) + Number(native.failed || 0),
    web,
    native,
  };
}

module.exports = { sendPushToUsers };
