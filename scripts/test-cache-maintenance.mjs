import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { clearSafeSessionCache } = require('../desktop/cache-maintenance.cjs');

const calls = [];
let sizeRead = 0;
const result = await clearSafeSessionCache({
  async getCacheSize() {
    sizeRead += 1;
    return sizeRead === 1 ? 25 * 1024 * 1024 : 3 * 1024 * 1024;
  },
  async clearCache() { calls.push(['clearCache']); },
  async clearCodeCaches(options) { calls.push(['clearCodeCaches', options]); },
  async clearStorageData(options) { calls.push(['clearStorageData', options]); },
  async clearHostResolverCache() { calls.push(['clearHostResolverCache']); },
});

assert.deepEqual(calls, [
  ['clearCache'],
  ['clearCodeCaches', { urls: [] }],
  ['clearStorageData', { storages: ['shadercache', 'serviceworkers', 'cachestorage'] }],
  ['clearHostResolverCache'],
]);
assert.equal(result.beforeBytes, 25 * 1024 * 1024);
assert.equal(result.afterBytes, 3 * 1024 * 1024);
assert.equal(result.freedBytes, 22 * 1024 * 1024);
assert.deepEqual(result.preserved, ['cookies', 'localstorage', 'indexdb']);

await assert.rejects(() => clearSafeSessionCache(null), /valid Electron Session/);
console.log('Safe cache maintenance tests passed.');
