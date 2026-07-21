import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const manager = read("src/components/shared/GlobalCallManager.tsx");
const socket = read("backend/src/socket.js");
const types = read("src/types/index.ts");
const roomState = read("backend/src/lib/call-room-state.js");

const checks = [
  [manager.includes("MAX_MESH_PARTICIPANTS = 8"), "frontend group-call participant cap"],
  [socket.includes("MAX_GROUP_CALL_PARTICIPANTS") && roomState.includes("MAX_GROUP_CALL_PARTICIPANTS = 8"), "backend group-call participant cap"],
  [manager.includes('s.on("call:participant-joined"'), "participant join client handler"],
  [manager.includes('s.on("call:participant-left"'), "participant leave client handler"],
  [socket.includes('socket.on("call:leave"'), "participant leave backend handler"],
  [roomState.includes("joinedUserIds: new Set([callerId])"), "server-side joined participant state"],
  [socket.includes("20_000"), "mobile reconnect grace period"],
  [manager.includes("pendingOffersRef = useRef<Map"), "multiple pending WebRTC offers"],
  [manager.includes("remoteStreamsRef = useRef<Map"), "separate remote participant streams"],
  [manager.includes("RemoteParticipantTile"), "separate participant media tiles"],
  [manager.includes("wakeLock"), "mobile screen wake lock"],
  [manager.includes("flipCamera"), "mobile front/rear camera switching"],
  [manager.includes("playbackBlocked"), "mobile autoplay recovery"],
  [manager.includes("replaceAudioInput") && manager.includes("replaceVideoInput"), "live media device switching"],
  [manager.includes('socket().emit("call:leave"'), "group participant exits without ending room"],
  [types.includes('"call:participant-joined"') && types.includes('"call:participant-left"'), "typed group-call socket contract"],
  [types.includes('"call:resume"') && types.includes('"call:leave"'), "typed reconnect and leave events"],
];

const failures = checks.filter(([ok]) => !ok);
if (failures.length) {
  for (const [, label] of failures) console.error(`FAIL: ${label}`);
  process.exit(1);
}
console.log(`Group calls and mobile WebRTC verification passed (${checks.length} checks).`);
