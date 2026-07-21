import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const checks = [
  [read('public/sw.js').includes('self.addEventListener("push"'), 'service worker push handler'],
  [read('public/sw.js').includes('notificationclick'), 'push notification click routing'],
  [read('src/lib/pushNotifications.ts').includes('pushManager.subscribe'), 'client Web Push subscription'],
  [read('src/app/(app)/settings/page.tsx').includes('enableWebPush'), 'settings Web Push controls'],
  [read('backend/src/lib/web-push.js').includes('sendWebPushToUsers'), 'backend Web Push sender'],
  [read('backend/src/routes/notifications.js').includes('/push-subscriptions'), 'subscription API routes'],
  [read('backend/src/socket.js').includes('kind: "call"'), 'incoming call background push'],
  [read('backend/src/socket.js').includes('kind: "message"'), 'message background push'],
  [read('backend/src/lib/call-history.js').includes('createCallHistory'), 'call history persistence'],
  [read('backend/src/routes/calls.js').includes("callsRouter.get('/history'"), 'call history API'],
  [read('backend/src/routes/calls.js').includes("callsRouter.get('/pending'"), 'pending incoming call recovery API'],
  [read('src/components/shared/GlobalCallManager.tsx').includes('api.getPendingCall()'), 'pending call recovery in client'],
  [read('src/app/(app)/calls/page.tsx').includes('api.getCallHistory'), 'visible call history page'],
  [read('supabase/migration_call_history_web_push.sql').includes('create table if not exists public.push_subscriptions'), 'push subscription migration'],
  [read('supabase/migration_call_history_web_push.sql').includes('create table if not exists public.call_history'), 'call history migration'],
  [read('backend/.env.example').includes('WEB_PUSH_PUBLIC_KEY'), 'VAPID environment documentation'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}
console.log(`Web Push and call history verification passed (${checks.length} checks).`);
