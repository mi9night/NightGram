const assert = require('node:assert/strict');
const { quietHoursActive } = require('../backend/src/lib/web-push');
const notificationsRouter = require('../backend/src/routes/notifications');

const { validEndpoint } = notificationsRouter._internals;
assert.equal(validEndpoint('https://push.example.test/subscription'), 'https://push.example.test/subscription');
assert.equal(validEndpoint('http://push.example.test/subscription'), null);
assert.equal(validEndpoint('not-a-url'), null);

const settings = {
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};
assert.equal(quietHoursActive(settings, 0, new Date('2026-07-21T23:30:00.000Z')), true);
assert.equal(quietHoursActive(settings, 0, new Date('2026-07-21T12:00:00.000Z')), false);
// UTC+3 device reports getTimezoneOffset() = -180. 20:30 UTC is 23:30 local.
assert.equal(quietHoursActive(settings, -180, new Date('2026-07-21T20:30:00.000Z')), true);

console.log('Web Push endpoint and quiet-hours tests passed.');
