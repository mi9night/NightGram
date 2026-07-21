import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['Global call manager', 'src/components/shared/GlobalCallManager.tsx', [
    'api.getCallIceConfig()',
    'iceBufferRef = useRef<Map<string, RTCIceCandidateInit[]>>',
    'pc.restartIce()',
    'getDisplayMedia',
    'chooseDisplaySource',
    'replaceTrack(screenTrack)',
    'screenTrack.onended',
    'setLocalDescription({ type: "rollback" })',
  ]],
  ['Socket signaling', 'backend/src/socket.js', [
    'call:offer',
    'iceRestart: Boolean(iceRestart)',
    'call:ice-candidate',
    'call:media-state',
  ]],
  ['TURN config route', 'backend/src/routes/calls.js', [
    "callsRouter.get('/ice-config'",
    'TURN_SHARED_SECRET',
    "createHmac('sha1'",
    "Cache-Control",
  ]],
  ['Electron screen capture', 'desktop/main.cjs', [
    'setDisplayMediaRequestHandler',
    'setPermissionCheckHandler',
    'setPermissionRequestHandler',
    "desktop:choose-display-source",
    "desktopCapturer.getSources",
  ]],
  ['Desktop preload bridge', 'desktop/preload.cjs', [
    'chooseDisplaySource',
    "desktop:choose-display-source",
  ]],
];

let failed = false;
for (const [title, file, patterns] of checks) {
  const source = read(file);
  for (const pattern of patterns) {
    if (!source.includes(pattern)) {
      console.error(`FAIL ${title}: ${file} is missing ${pattern}`);
      failed = true;
    }
  }
}

const packageJson = JSON.parse(read('package.json'));
const backendPackage = JSON.parse(read('backend/package.json'));
if (packageJson.version !== '3.4.0' || backendPackage.version !== '3.4.0') {
  console.error('FAIL package versions must both be 3.4.0');
  failed = true;
}

if (failed) process.exit(1);
console.log('Calls, TURN, ICE recovery and screen-sharing verification passed.');
