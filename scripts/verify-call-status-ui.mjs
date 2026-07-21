import fs from "node:fs";

const source = fs.readFileSync("src/components/shared/GlobalCallManager.tsx", "utf8");
const checks = [
  [source.includes('label: "Подключение…"'), "статус подключения"],
  [source.includes('label: "Подключено"'), "статус подключено"],
  [source.includes('label: "Восстановление связи…"'), "статус восстановления"],
  [source.includes('label: "Отключено"'), "статус отключено"],
  [source.includes('label: "Нет сети"'), "статус отсутствия сети"],
  [source.includes('centeredAvatarStage = !isGroupCall && call.type === "audio"'), "центрирование личного аудиозвонка"],
  [source.includes('centered={centeredAvatarStage}'), "увеличенная центральная плитка аватара"],
  [source.includes('connectionState={peerConnectionStates[entry.userId]}'), "состояние отдельного участника"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
