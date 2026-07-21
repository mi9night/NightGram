import { access, chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');
const target = path.join(root, 'mobile-pwa-server');

async function assertExists(targetPath, label) {
  try { await access(targetPath); } catch { throw new Error(`${label} не найден: ${targetPath}. Сначала выполните npm run build.`); }
}

await assertExists(path.join(standalone, 'server.js'), 'Next.js standalone server');
await assertExists(staticDir, 'Next.js static assets');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(standalone, target, { recursive: true, dereference: true });
await mkdir(path.join(target, '.next'), { recursive: true });
await cp(staticDir, path.join(target, '.next', 'static'), { recursive: true });
await cp(publicDir, path.join(target, 'public'), { recursive: true });

const bat = `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nif "%HOSTNAME%"=="" set HOSTNAME=0.0.0.0\r\nif "%PORT%"=="" set PORT=3000\r\nif "%BACKEND_API_URL%"=="" set BACKEND_API_URL=https://nightgram-production-0ceb.up.railway.app/api\r\nif "%NEXT_PUBLIC_SOCKET_URL%"=="" set NEXT_PUBLIC_SOCKET_URL=https://nightgram-production-0ceb.up.railway.app\r\necho NightGram Mobile PWA 3.4.0: http://localhost:%PORT%\r\necho Для звонков, установки и Web Push используйте доверенный HTTPS-домен.\r\nnode server.js\r\npause\r\n`;
const sh = `#!/usr/bin/env sh\nset -eu\ncd "$(dirname "$0")"\nexport HOSTNAME="${'${HOSTNAME:-0.0.0.0}'}"\nexport PORT="${'${PORT:-3000}'}"\nexport BACKEND_API_URL="${'${BACKEND_API_URL:-https://nightgram-production-0ceb.up.railway.app/api}'}"\nexport NEXT_PUBLIC_SOCKET_URL="${'${NEXT_PUBLIC_SOCKET_URL:-https://nightgram-production-0ceb.up.railway.app}'}"\necho "NightGram Mobile PWA 3.4.0: http://localhost:$PORT"\necho "Для звонков, установки и Web Push используйте доверенный HTTPS-домен."\nexec node server.js\n`;
const readme = `NightGram 3.4.0 — мобильная PWA\n\n1. Запустите START_MOBILE_SERVER.bat (Windows) или START_MOBILE_SERVER.sh (Linux/macOS).\n2. Для проверки интерфейса в одной Wi-Fi-сети откройте на телефоне http://IP_КОМПЬЮТЕРА:3000.\n3. Камера, микрофон, установка PWA и Web Push требуют доверенный HTTPS-домен.\n4. В приложении откройте Настройки → Уведомления и включите push.\n5. Android: Chrome → Установить приложение. iPhone/iPad: Safari → Поделиться → На экран Домой.\n\nАктивный звонок восстанавливается после быстрой перезагрузки приложения. При слабой сети NightGram автоматически снижает битрейт видео.\n`;
await writeFile(path.join(target, 'START_MOBILE_SERVER.bat'), bat, 'utf8');
await writeFile(path.join(target, 'START_MOBILE_SERVER.sh'), sh, 'utf8');
await chmod(path.join(target, 'START_MOBILE_SERVER.sh'), 0o755);
await writeFile(path.join(target, 'README_MOBILE_RU.txt'), readme, 'utf8');
console.log(`Mobile PWA standalone prepared: ${target}`);
