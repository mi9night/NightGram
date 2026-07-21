const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.TURN_URLS = 'turn:turn.example.test:3478?transport=udp,turns:turn.example.test:5349?transport=tcp';
process.env.TURN_SHARED_SECRET = 'test-shared-secret';
process.env.TURN_TTL_SECONDS = '900';

const router = require('../backend/src/routes/calls');
const { csv, positiveInt, turnCredentials } = router._internals;

assert.deepEqual(csv(' a, b ,,c '), ['a', 'b', 'c']);
assert.equal(positiveInt('10', 20, 15, 30), 15);
assert.equal(positiveInt('200', 20, 15, 30), 30);

const before = Math.floor(Date.now() / 1000);
const creds = turnCredentials('user:with spaces');
const after = Math.floor(Date.now() / 1000);
assert.ok(creds);
assert.deepEqual(creds.urls, [
  'turn:turn.example.test:3478?transport=udp',
  'turns:turn.example.test:5349?transport=tcp',
]);
assert.match(creds.username, /^\d+:userwithspaces$/);
const expiresAt = Number(creds.username.split(':')[0]);
assert.ok(expiresAt >= before + 899 && expiresAt <= after + 901);
const expected = crypto.createHmac('sha1', process.env.TURN_SHARED_SECRET).update(creds.username).digest('base64');
assert.equal(creds.credential, expected);

console.log('TURN short-lived credential test passed.');
