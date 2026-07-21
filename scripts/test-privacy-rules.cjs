const path = require('node:path');
const assert = require('node:assert/strict');

const state = {
  users: new Map(),
  follows: [],
  friendships: [],
  blocks: [],
};

function makeQuery(table) {
  const query = { filters: [], orExpr: null };
  const api = {
    select() { return api; },
    eq(column, value) { query.filters.push([column, String(value)]); return api; },
    or(expr) { query.orExpr = expr; return api; },
    maybeSingle() { return Promise.resolve(resolveRows(table, query, true)); },
    then(resolve, reject) { return Promise.resolve(resolveRows(table, query, false)).then(resolve, reject); },
  };
  return api;
}

function resolveRows(table, query, single) {
  let rows = [];
  if (table === 'users') rows = [...state.users.values()];
  if (table === 'follows') rows = state.follows;
  if (table === 'friendships') rows = state.friendships;
  if (table === 'user_blocks') rows = state.blocks;
  rows = rows.filter((row) => query.filters.every(([key, value]) => String(row[key]) === value));
  if (query.orExpr && table === 'user_blocks') {
    const ids = [...query.orExpr.matchAll(/user_id\.eq\.([^,)]+),blocked_id\.eq\.([^,)]+)/g)].map((match) => [match[1], match[2]]);
    rows = state.blocks.filter((row) => ids.some(([a, b]) => String(row.user_id) === a && String(row.blocked_id) === b));
  }
  return single ? { data: rows[0] || null, error: null } : { data: rows, error: null };
}

const fakeSupabase = { from: makeQuery };
const supabasePath = path.resolve(__dirname, '../backend/src/lib/supabase.js');
require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: { supabase: fakeSupabase } };
const privacy = require('../backend/src/lib/privacy.js');

async function run() {
  state.users.set('owner', {
    id: 'owner',
    privacy_profile: 'friends',
    privacy_messages: 'friends',
    privacy_groups: 'following',
    privacy_last_seen: 'nobody',
    hide_read_receipts: true,
    filter_unknown_messages: true,
  });
  state.users.set('friend', { id: 'friend' });
  state.users.set('follower', { id: 'follower' });
  state.users.set('stranger', { id: 'stranger' });
  state.friendships.push({ user_id: 'owner', friend_id: 'friend', status: 'accepted' });
  state.follows.push({ follower_id: 'follower', following_id: 'owner' });

  assert.equal(await privacy.canMessage('owner', 'friend'), true);
  assert.equal(await privacy.canMessage('owner', 'stranger'), false);
  assert.equal(await privacy.canAddToGroups('owner', 'follower'), true);
  assert.equal(await privacy.canAddToGroups('owner', 'stranger'), false);
  assert.equal(await privacy.canViewLastSeen('owner', 'friend'), false);
  assert.equal((await privacy.getPrivacySettings('owner')).hide_read_receipts, true);

  state.blocks.push({ user_id: 'owner', blocked_id: 'friend' });
  assert.equal((await privacy.blockState('owner', 'friend')).blockedByA, true);
  assert.equal(await privacy.canViewProfile('owner', 'friend'), false);

  console.log('Privacy rules tests passed.');
}
run().catch((error) => { console.error(error); process.exit(1); });
