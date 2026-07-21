import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manager = read('src/components/shared/GlobalCallManager.tsx');
const quality = read('src/lib/callQuality.ts');
const sw = read('public/sw.js');
const pwa = read('src/components/shared/PwaBridge.tsx');
const socket = read('backend/src/socket.js');
const admission = read('backend/src/lib/call-admission.js');

const checks = [
  [manager.includes('ACTIVE_CALL_SESSION_KEY'), 'active call session persistence'],
  [manager.includes('call:resume') && manager.includes('Восстанавливаем звонок после перезапуска'), 'call restore after reload'],
  [manager.includes('pc.getStats()'), 'WebRTC statistics collection'],
  [manager.includes('applyAdaptiveVideoQuality'), 'adaptive video bitrate'],
  [manager.includes('window.addEventListener("offline"'), 'network offline recovery'],
  [quality.includes('classifyCallQuality') && quality.includes('videoEncodingForQuality'), 'quality classifier and encoding profiles'],
  [sw.includes('accept-call') && sw.includes('reject-call'), 'incoming call notification actions'],
  [pwa.includes('nightgram:accept-call') && pwa.includes('nightgram:reject-call'), 'notification action bridge'],
  [sw.includes('/offline.html') && fs.existsSync(path.join(root, 'public/offline.html')), 'PWA offline fallback'],
  [socket.includes('admitCall(activeCalls'), 'backend duplicate call admission'],
  [socket.includes('CALL_RING_TIMEOUT_SECONDS'), 'configurable ringing timeout'],
  [admission.includes('already_in_call') && admission.includes('participant_busy'), 'busy-user rules'],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}
console.log(`Call reliability verification passed (${checks.length} checks).`);
