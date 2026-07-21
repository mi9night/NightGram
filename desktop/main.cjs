const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  shell,
  dialog,
  ipcMain,
  Notification,
  crashReporter,
  session,
  desktopCapturer,
} = require('electron');
const { fork } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { createUpdateManager } = require('./updater.cjs');
const { consumeInstallerPreferences } = require('./installer-preferences.cjs');
const { clearSafeSessionCache } = require('./cache-maintenance.cjs');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let localUrl = null;
let isQuitting = false;
let diagnosticsReady = false;
let updateManager = null;
let previousSessionUnclean = false;
let upgradedFromVersion = null;
let upgradeNoticeShown = false;
let applicationStartedAt = new Date().toISOString();
const earlyDiagnosticEntries = [];
const rendererRecoveryAttempts = [];
let pendingDisplaySourceId = null;

const LOG_MAX_BYTES = 2 * 1024 * 1024;
const LOG_TAIL_LINES = 450;
const REDACTED = '[REDACTED]';

const defaultDesktopSettings = {
  launchAtLogin: false,
  closeToTray: true,
  nativeNotifications: true,
  autoCheckUpdates: true,
  updateChannel: 'stable',
};

crashReporter.start({
  productName: 'NightGram',
  companyName: 'NightGram',
  uploadToServer: false,
  compress: true,
});

function settingsFile() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function installerPreferencesFile() {
  if (!app.isPackaged) return null;
  return path.join(path.dirname(process.execPath), 'installer-preferences.json');
}

function installStateFile() {
  return path.join(app.getPath('userData'), 'desktop-install-state.json');
}

function preferencesBackupDirectory() {
  return path.join(app.getPath('userData'), 'preferences-backups');
}

function sessionStateFile() {
  return path.join(app.getPath('userData'), 'desktop-session-state.json');
}

function diagnosticsDirectory() {
  return app.getPath('logs');
}

function diagnosticsLogFile() {
  return path.join(diagnosticsDirectory(), 'nightgram-desktop.log');
}

function sanitizeString(value, maxLength = 1600) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/("?(?:accessToken|refreshToken|token|authorization|password)"?\s*[:=]\s*)["']?[^\s,"'}]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:token|access_token|refresh_token|code)=)[^&\s]+/gi, `$1${REDACTED}`)
    .slice(0, maxLength);
}

function sanitizeMeta(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value, 900);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name, 100),
      message: sanitizeString(value.message, 900),
      stack: sanitizeString(value.stack || '', 3000),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeMeta(entry, depth + 1));
  if (typeof value === 'object') {
    const clean = {};
    for (const [key, entry] of Object.entries(value).slice(0, 30)) {
      if (/token|password|authorization|cookie|messageBody|content/i.test(key)) {
        clean[key] = REDACTED;
      } else {
        clean[sanitizeString(key, 80)] = sanitizeMeta(entry, depth + 1);
      }
    }
    return clean;
  }
  return sanitizeString(value, 500);
}

function rotateDiagnosticsLogIfNeeded() {
  const current = diagnosticsLogFile();
  try {
    if (!fs.existsSync(current) || fs.statSync(current).size < LOG_MAX_BYTES) return;
    const previous = `${current}.1`;
    const older = `${current}.2`;
    fs.rmSync(older, { force: true });
    if (fs.existsSync(previous)) fs.renameSync(previous, older);
    fs.renameSync(current, previous);
  } catch {
    // Diagnostics must never prevent NightGram from starting.
  }
}

function appendDiagnostic(level, scope, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level: sanitizeString(level, 20),
    scope: sanitizeString(scope, 80),
    message: sanitizeString(message, 1400),
    ...(meta === undefined ? {} : { meta: sanitizeMeta(meta) }),
  };

  if (!diagnosticsReady) {
    earlyDiagnosticEntries.push(entry);
    if (earlyDiagnosticEntries.length > 100) earlyDiagnosticEntries.shift();
    return;
  }

  try {
    fs.mkdirSync(diagnosticsDirectory(), { recursive: true });
    rotateDiagnosticsLogIfNeeded();
    fs.appendFileSync(diagnosticsLogFile(), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Logging failures are intentionally ignored.
  }
}

function flushEarlyDiagnostics() {
  diagnosticsReady = true;
  const pending = earlyDiagnosticEntries.splice(0);
  for (const entry of pending) appendDiagnostic(entry.level, entry.scope, entry.message, entry.meta);
}

function normalizeDesktopSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    launchAtLogin: typeof input.launchAtLogin === 'boolean' ? input.launchAtLogin : defaultDesktopSettings.launchAtLogin,
    closeToTray: typeof input.closeToTray === 'boolean' ? input.closeToTray : defaultDesktopSettings.closeToTray,
    nativeNotifications: typeof input.nativeNotifications === 'boolean' ? input.nativeNotifications : defaultDesktopSettings.nativeNotifications,
    autoCheckUpdates: typeof input.autoCheckUpdates === 'boolean' ? input.autoCheckUpdates : defaultDesktopSettings.autoCheckUpdates,
    updateChannel: input.updateChannel === 'beta' ? 'beta' : 'stable',
  };
}

function readDesktopSettings() {
  const target = settingsFile();
  for (const candidate of [target, `${target}.backup`]) {
    try {
      return normalizeDesktopSettings(JSON.parse(fs.readFileSync(candidate, 'utf8')));
    } catch {
      // Try the atomic backup before falling back to defaults.
    }
  }
  return { ...defaultDesktopSettings };
}

function writeDesktopSettings(next) {
  const clean = normalizeDesktopSettings(next);
  const target = settingsFile();
  const temporary = `${target}.tmp`;
  const backup = `${target}.backup`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.copyFileSync(target, backup);
  fs.writeFileSync(temporary, JSON.stringify(clean, null, 2), 'utf8');
  fs.rmSync(target, { force: true });
  fs.renameSync(temporary, target);
  return clean;
}

function applyInstallerPreferences() {
  const marker = installerPreferencesFile();
  const result = consumeInstallerPreferences({
    markerPath: marker,
    currentSettings: readDesktopSettings(),
    writeSettings: writeDesktopSettings,
  });

  if (result.applied) {
    appendDiagnostic('info', 'installer', 'Применены параметры первого запуска из установщика.', {
      launchAtLogin: result.launchAtLogin,
    });
    return result.settings;
  }
  if (result.error) {
    appendDiagnostic('warn', 'installer', 'Не удалось применить параметры установщика.', result.error);
  }
  return null;
}

function normalizeWebPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const exactKeys = new Set([
    'ng_appearance',
    'ng_audio_output_device',
    'ng_saved_chat_pinned',
    'ng_channel_used_tags',
    'ng_integrations',
    'ng_active_store_theme',
    'ng_active_store_accent',
    'ng_active_sticker_pack',
    'ng_active_profile_background',
  ]);
  const result = {};
  let totalLength = 0;
  for (const [key, entry] of Object.entries(value)) {
    const allowed = exactKeys.has(key) || key.startsWith('ng_chat_theme:') || key.startsWith('ng_store_effect:');
    if (!allowed || typeof entry !== 'string' || entry.length > 32_000) continue;
    totalLength += key.length + entry.length;
    if (totalLength > 192_000) break;
    result[key] = entry;
  }
  return result;
}

function createPreferencesPayload(webPreferences = {}) {
  return {
    format: 'nightgram-preferences',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    desktopSettings: readDesktopSettings(),
    webPreferences: normalizeWebPreferences(webPreferences),
  };
}

async function exportPreferences(webPreferences) {
  const safeTimestamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: 'Сохранить настройки NightGram',
    defaultPath: path.join(app.getPath('documents'), `NightGram-Preferences-${safeTimestamp}.json`),
    filters: [{ name: 'NightGram preferences', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, JSON.stringify(createPreferencesPayload(webPreferences), null, 2), 'utf8');
  appendDiagnostic('info', 'preferences', 'Резервная копия настроек сохранена.', { file: result.filePath });
  return result.filePath;
}

async function importPreferences() {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: 'Восстановить настройки NightGram',
    properties: ['openFile'],
    filters: [{ name: 'NightGram preferences', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  if (stat.size > 512 * 1024) throw new Error('Файл настроек слишком большой.');
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (payload?.format !== 'nightgram-preferences' || payload?.schemaVersion !== 1) {
    throw new Error('Выбранный файл не является резервной копией NightGram.');
  }
  const desktopSettings = writeDesktopSettings(payload.desktopSettings);
  const webPreferences = normalizeWebPreferences(payload.webPreferences);
  app.setLoginItemSettings({ openAtLogin: desktopSettings.launchAtLogin, path: process.execPath });
  updateManager?.settingsChanged();
  appendDiagnostic('info', 'preferences', 'Настройки восстановлены из резервной копии.', {
    file: filePath,
    webPreferenceCount: Object.keys(webPreferences).length,
  });
  return { filePath, desktopSettings, webPreferences, requiresReload: true };
}

function initializeInstallState() {
  const currentVersion = app.getVersion();
  let previousVersion = null;
  try {
    const previous = JSON.parse(fs.readFileSync(installStateFile(), 'utf8'));
    previousVersion = typeof previous?.lastRunVersion === 'string' ? previous.lastRunVersion : null;
  } catch {
    previousVersion = null;
  }
  if (previousVersion && previousVersion !== currentVersion) {
    upgradedFromVersion = previousVersion;
    try {
      fs.mkdirSync(preferencesBackupDirectory(), { recursive: true });
      const automaticBackup = path.join(preferencesBackupDirectory(), `desktop-settings-before-${currentVersion}.json`);
      fs.writeFileSync(automaticBackup, JSON.stringify(createPreferencesPayload({}), null, 2), 'utf8');
      const backups = fs.readdirSync(preferencesBackupDirectory())
        .filter((name) => /^desktop-settings-before-.*\.json$/i.test(name))
        .map((name) => ({ name, time: fs.statSync(path.join(preferencesBackupDirectory(), name)).mtimeMs }))
        .sort((left, right) => right.time - left.time);
      for (const old of backups.slice(5)) fs.rmSync(path.join(preferencesBackupDirectory(), old.name), { force: true });
    } catch (error) {
      appendDiagnostic('warn', 'preferences', 'Не удалось создать автоматическую копию настроек перед обновлением.', error);
    }
  }
  fs.mkdirSync(path.dirname(installStateFile()), { recursive: true });
  fs.writeFileSync(installStateFile(), JSON.stringify({ lastRunVersion: currentVersion, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

async function showUpgradeNotice() {
  if (!upgradedFromVersion || upgradeNoticeShown || !mainWindow || mainWindow.isDestroyed()) return;
  upgradeNoticeShown = true;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'NightGram обновлён',
    message: `NightGram обновлён до версии ${app.getVersion()}.`,
    detail: `Предыдущая версия: ${upgradedFromVersion}. Ваши настройки сохранены; их автоматическая копия находится в папке данных приложения.`,
    buttons: ['Продолжить', 'Открыть настройки'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  appendDiagnostic('info', 'lifecycle', 'Показано уведомление о переходе версии.', { from: upgradedFromVersion, to: app.getVersion() });
  if (result.response === 1 && localUrl && mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadURL(`${localUrl}/settings`);
  }
}

function initializeSessionState() {
  try {
    const previous = JSON.parse(fs.readFileSync(sessionStateFile(), 'utf8'));
    previousSessionUnclean = previous?.cleanShutdown === false;
  } catch {
    previousSessionUnclean = false;
  }

  writeSessionState(false);
}

function writeSessionState(cleanShutdown) {
  try {
    fs.mkdirSync(path.dirname(sessionStateFile()), { recursive: true });
    fs.writeFileSync(
      sessionStateFile(),
      JSON.stringify({ cleanShutdown, startedAt: applicationStartedAt, updatedAt: new Date().toISOString() }, null, 2),
      'utf8',
    );
  } catch (error) {
    appendDiagnostic('warn', 'session', 'Не удалось записать состояние сессии.', error);
  }
}

function readLogTail() {
  try {
    const log = fs.readFileSync(diagnosticsLogFile(), 'utf8');
    return log.split(/\r?\n/).filter(Boolean).slice(-LOG_TAIL_LINES);
  } catch {
    return [];
  }
}

function getDiagnosticsSummary() {
  const memory = process.memoryUsage();
  return {
    appVersion: app.getVersion(),
    appName: app.getName(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    osType: os.type(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    startedAt: applicationStartedAt,
    previousSessionUnclean,
    localServerRunning: Boolean(serverProcess && !serverProcess.killed && serverProcess.exitCode === null),
    rendererResponsive: Boolean(mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isCrashed()),
    memoryMb: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      systemFree: Math.round(os.freemem() / 1024 / 1024),
      systemTotal: Math.round(os.totalmem() / 1024 / 1024),
    },
    paths: {
      logs: diagnosticsDirectory(),
      logFile: diagnosticsLogFile(),
      crashDumps: app.getPath('crashDumps'),
      preferencesBackups: preferencesBackupDirectory(),
    },
    settings: readDesktopSettings(),
    updater: updateManager ? updateManager.getState() : null,
  };
}

function createDiagnosticsReport() {
  return {
    generatedAt: new Date().toISOString(),
    privacyNotice: 'Отчёт не содержит токены, пароли или текст переписки. Перед отправкой его всё равно можно открыть и проверить.',
    diagnostics: getDiagnosticsSummary(),
    recentLogEntries: readLogTail(),
  };
}

async function exportDiagnosticsReport() {
  const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const result = await dialog.showSaveDialog(mainWindow || undefined, {
    title: 'Сохранить диагностику NightGram',
    defaultPath: path.join(app.getPath('downloads'), `NightGram-Diagnostics-${safeTimestamp}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, JSON.stringify(createDiagnosticsReport(), null, 2), 'utf8');
  appendDiagnostic('info', 'diagnostics', 'Диагностический отчёт сохранён.', { file: result.filePath });
  return result.filePath;
}

const isDev = !app.isPackaged;

function getIconPath() {
  const candidates = isDev
    ? [path.join(__dirname, '..', 'build', 'icon.png'), path.join(__dirname, '..', 'public', 'icon.png')]
    : [path.join(process.resourcesPath, 'icon.png'), path.join(__dirname, '..', 'build', 'icon.png')];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 3210;
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      request.on('error', retry);
      request.setTimeout(1500, () => request.destroy());
    };

    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Локальный сервер NightGram не запустился вовремя.'));
        return;
      }
      setTimeout(check, 350);
    };

    check();
  });
}

async function startLocalServer() {
  const port = await findFreePort();
  const runtimeRoot = isDev
    ? path.join(__dirname, '..', 'desktop-runtime', 'app')
    : path.join(process.resourcesPath, 'app');
  const serverFile = path.join(runtimeRoot, 'server.js');
  const runtimeNodeModules = path.join(runtimeRoot, 'node_modules');
  const nextPackage = path.join(runtimeNodeModules, 'next', 'package.json');

  if (!fs.existsSync(serverFile)) {
    throw new Error(`Не найдена desktop-сборка: ${serverFile}`);
  }
  if (!fs.existsSync(nextPackage)) {
    throw new Error(`Desktop-runtime повреждён: отсутствует ${nextPackage}. Переустановите NightGram новой сборкой.`);
  }

  appendDiagnostic('info', 'server', 'Запуск локального Next.js runtime.', {
    port,
    packaged: app.isPackaged,
    runtimeRoot,
    nextIncluded: true,
  });
  serverProcess = fork(serverFile, [], {
    cwd: runtimeRoot,
    silent: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      NODE_PATH: [runtimeNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      BACKEND_API_URL: process.env.BACKEND_API_URL || 'https://nightgram-production-0ceb.up.railway.app/api',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://nightgram-production-0ceb.up.railway.app/api',
      NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL || 'https://nightgram-production-0ceb.up.railway.app',
    },
  });

  serverProcess.stdout?.on('data', (data) => appendDiagnostic('info', 'next-server', sanitizeString(data, 1800)));
  serverProcess.stderr?.on('data', (data) => appendDiagnostic('error', 'next-server', sanitizeString(data, 2400)));
  serverProcess.on('error', (error) => appendDiagnostic('error', 'server', 'Ошибка процесса локального сервера.', error));
  serverProcess.on('exit', (code, signal) => {
    appendDiagnostic(code === 0 ? 'info' : 'error', 'server', 'Локальный сервер завершил работу.', { code, signal, quitting: isQuitting });
    if (!isQuitting && code !== 0) void handleCriticalServerExit();
  });

  localUrl = `http://127.0.0.1:${port}`;
  await waitForServer(localUrl);
  appendDiagnostic('info', 'server', 'Локальный сервер готов.', { port });
  return localUrl;
}

async function handleCriticalServerExit() {
  const result = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'error',
    title: 'NightGram требует перезапуска',
    message: 'Локальный сервер приложения неожиданно остановился.',
    detail: 'Можно перезапустить NightGram или открыть папку диагностики.',
    buttons: ['Перезапустить', 'Открыть диагностику', 'Выйти'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  if (result.response === 0) {
    isQuitting = true;
    app.relaunch();
    app.exit(1);
  } else if (result.response === 1) {
    await shell.openPath(diagnosticsDirectory());
  } else {
    quitApplication();
  }
}


async function checkForUpdatesFromMenu() {
  if (!updateManager) return;
  const result = await updateManager.checkForUpdates();
  if (result?.status === 'available' || result?.status === 'downloaded' || result?.status === 'downloading') {
    showMainWindow();
    if (localUrl && mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(`${localUrl}/settings`);
    return;
  }
  const message = result?.status === 'up-to-date'
    ? 'Установлена актуальная версия NightGram.'
    : result?.error || 'Не удалось проверить обновления.';
  await dialog.showMessageBox(mainWindow || undefined, {
    type: result?.status === 'error' ? 'warning' : 'info',
    title: 'Обновления NightGram',
    message,
    buttons: ['OK'],
    noLink: true,
  });
}


function isTrustedNightGramOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    if (localUrl && String(value || '').startsWith(localUrl)) return true;
    return ['127.0.0.1', 'localhost'].includes(url.hostname);
  } catch {
    return false;
  }
}

function configureMediaPermissions(targetSession) {
  targetSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details = {}) => {
    const origin = requestingOrigin || details.requestingUrl || details.securityOrigin || '';
    return isTrustedNightGramOrigin(origin) && ['media', 'display-capture'].includes(permission);
  });

  targetSession.setPermissionRequestHandler((_webContents, permission, callback, details = {}) => {
    const origin = details.requestingUrl || details.securityOrigin || '';
    callback(isTrustedNightGramOrigin(origin) && ['media', 'display-capture'].includes(permission));
  });

  targetSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      const selected = sources.find((source) => source.id === pendingDisplaySourceId)
        || sources.find((source) => source.id.startsWith('screen:'))
        || sources[0];
      pendingDisplaySourceId = null;
      callback(selected ? { video: selected } : {});
    } catch (error) {
      pendingDisplaySourceId = null;
      appendDiagnostic('error', 'screen-share', 'Не удалось получить источники демонстрации экрана.', error);
      callback({});
    }
  });
}

function createApplicationMenu() {
  const template = [
    {
      label: 'NightGram',
      submenu: [
        { label: 'Открыть NightGram', click: () => showMainWindow() },
        { type: 'separator' },
        { label: 'Перезагрузить', accelerator: 'Ctrl+R', click: () => mainWindow?.reload() },
        { label: 'Открыть инструменты разработчика', accelerator: 'Ctrl+Shift+I', click: () => mainWindow?.webContents.toggleDevTools() },
        { label: 'Проверить обновления', click: () => void checkForUpdatesFromMenu() },
        { label: 'Открыть диагностику', click: () => shell.openPath(diagnosticsDirectory()) },
        { type: 'separator' },
        { label: 'Выйти', accelerator: 'Alt+F4', click: () => quitApplication() },
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'resetZoom', label: 'Сбросить масштаб' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полный экран' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const iconPath = getIconPath();
  if (!iconPath) return;

  const image = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip('NightGram');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть NightGram', click: () => showMainWindow() },
    { label: 'Перезагрузить', click: () => mainWindow?.reload() },
    { label: 'Проверить обновления', click: () => void checkForUpdatesFromMenu() },
    { label: 'Открыть диагностику', click: () => shell.openPath(diagnosticsDirectory()) },
    { type: 'separator' },
    { label: 'Выйти', click: () => quitApplication() },
  ]));
  tray.on('double-click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApplication() {
  isQuitting = true;
  app.quit();
}

function recentRendererRecoveryCount() {
  const cutoff = Date.now() - 60_000;
  while (rendererRecoveryAttempts.length && rendererRecoveryAttempts[0] < cutoff) rendererRecoveryAttempts.shift();
  return rendererRecoveryAttempts.length;
}

async function recoverRenderer(details) {
  if (isQuitting || details.reason === 'clean-exit') return;
  rendererRecoveryAttempts.push(Date.now());

  if (recentRendererRecoveryCount() <= 2 && mainWindow && !mainWindow.isDestroyed()) {
    appendDiagnostic('warn', 'renderer', 'Автоматическое восстановление renderer-процесса.', details);
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.reloadIgnoringCache();
      mainWindow.show();
    }, 700);
    return;
  }

  const result = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'error',
    title: 'NightGram столкнулся с повторной ошибкой',
    message: 'Интерфейс приложения несколько раз аварийно завершился.',
    detail: 'Диагностический журнал уже сохранён. Рекомендуется открыть его или перезапустить приложение.',
    buttons: ['Перезапустить', 'Открыть диагностику', 'Выйти'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });

  if (result.response === 0) {
    isQuitting = true;
    app.relaunch();
    app.exit(1);
  } else if (result.response === 1) {
    await shell.openPath(diagnosticsDirectory());
  } else {
    quitApplication();
  }
}

async function createMainWindow() {
  const iconPath = getIconPath();
  const url = localUrl || (await startLocalServer());

  mainWindow = new BrowserWindow({
    title: 'NightGram',
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#05030b',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  configureMediaPermissions(mainWindow.webContents.session);

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (/^https?:\/\//i.test(targetUrl)) shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (localUrl && !targetUrl.startsWith(localUrl)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    appendDiagnostic('error', 'renderer-load', 'Не удалось загрузить интерфейс NightGram.', {
      errorCode,
      errorDescription,
      url: validatedURL,
    });
  });
  mainWindow.webContents.on('unresponsive', () => appendDiagnostic('warn', 'renderer', 'Интерфейс перестал отвечать.'));
  mainWindow.webContents.on('responsive', () => appendDiagnostic('info', 'renderer', 'Интерфейс снова отвечает.'));
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appendDiagnostic('error', 'renderer', 'Renderer-процесс завершился.', details);
    void recoverRenderer(details);
  });

  mainWindow.webContents.once('dom-ready', () => {
    appendDiagnostic('info', 'window', 'Главное окно готово к отображению.');
    mainWindow?.show();
    setTimeout(() => void showUpgradeNotice(), 900);
  });
  mainWindow.on('close', (event) => {
    const settings = readDesktopSettings();
    if (!isQuitting && settings.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(url);
}

function registerDesktopIpc() {
  ipcMain.handle('desktop:get-version', () => app.getVersion());
  ipcMain.handle('desktop:get-settings', () => readDesktopSettings());
  ipcMain.handle('desktop:update-settings', (_event, patch = {}) => {
    const booleanKeys = ['launchAtLogin', 'closeToTray', 'nativeNotifications', 'autoCheckUpdates'];
    const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([key, value]) => booleanKeys.includes(key) && typeof value === 'boolean'));
    if (patch.updateChannel === 'stable' || patch.updateChannel === 'beta') cleanPatch.updateChannel = patch.updateChannel;
    const next = writeDesktopSettings({ ...readDesktopSettings(), ...cleanPatch });
    app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, path: process.execPath });
    appendDiagnostic('info', 'settings', 'Настройки Windows-приложения обновлены.', cleanPatch);
    if (Object.prototype.hasOwnProperty.call(cleanPatch, 'autoCheckUpdates') || Object.prototype.hasOwnProperty.call(cleanPatch, 'updateChannel')) {
      updateManager?.settingsChanged();
    }
    return next;
  });
  ipcMain.handle('desktop:notify', (_event, payload = {}) => {
    const settings = readDesktopSettings();
    if (!settings.nativeNotifications || !Notification.isSupported()) return false;
    const notification = new Notification({
      title: String(payload.title || 'NightGram').slice(0, 120),
      body: String(payload.body || '').slice(0, 300),
      icon: getIconPath(),
      silent: Boolean(payload.silent),
    });
    notification.on('click', () => showMainWindow());
    notification.show();
    return true;
  });
  ipcMain.handle('desktop:report-error', (_event, payload = {}) => {
    appendDiagnostic(payload.level === 'warn' ? 'warn' : 'error', `renderer:${payload.scope || 'runtime'}`, payload.message || 'Ошибка интерфейса.', {
      name: payload.name,
      stack: payload.stack,
      route: payload.route,
      context: payload.context,
    });
    return true;
  });
  ipcMain.handle('desktop:get-diagnostics', () => getDiagnosticsSummary());
  ipcMain.handle('desktop:open-diagnostics', () => {
    fs.mkdirSync(diagnosticsDirectory(), { recursive: true });
    return shell.openPath(diagnosticsDirectory());
  });
  ipcMain.handle('desktop:export-diagnostics', () => exportDiagnosticsReport());
  ipcMain.handle('desktop:export-preferences', (_event, webPreferences = {}) => exportPreferences(webPreferences));
  ipcMain.handle('desktop:import-preferences', () => importPreferences());
  ipcMain.handle('desktop:open-downloads', () => shell.openPath(app.getPath('downloads')));
  ipcMain.handle('desktop:choose-display-source', async () => {
    try {
      const allSources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      const screens = allSources.filter((source) => source.id.startsWith('screen:'));
      const windows = allSources.filter((source) => source.id.startsWith('window:')).slice(0, 12);
      const sources = [...screens, ...windows];
      if (!sources.length) return null;
      const labels = sources.map((source, index) => `${source.id.startsWith('screen:') ? 'Экран' : 'Окно'} ${index + 1}: ${String(source.name || '').slice(0, 80)}`);
      const cancelId = labels.length;
      const result = await dialog.showMessageBox(mainWindow || undefined, {
        type: 'question',
        title: 'Демонстрация экрана NightGram',
        message: 'Что показать собеседнику?',
        detail: 'После выбора Windows может дополнительно показать системный индикатор захвата.',
        buttons: [...labels, 'Отмена'],
        defaultId: 0,
        cancelId,
        noLink: true,
      });
      if (result.response === cancelId || !sources[result.response]) {
        pendingDisplaySourceId = null;
        return null;
      }
      const selected = sources[result.response];
      pendingDisplaySourceId = selected.id;
      appendDiagnostic('info', 'screen-share', 'Выбран источник демонстрации экрана.', { sourceName: selected.name, sourceType: selected.id.split(':')[0] });
      return { id: selected.id, name: selected.name };
    } catch (error) {
      pendingDisplaySourceId = null;
      appendDiagnostic('error', 'screen-share', 'Не удалось выбрать источник демонстрации экрана.', error);
      return null;
    }
  });
  ipcMain.handle('desktop:clear-cache', async () => {
    const targetSession = mainWindow?.webContents?.session || session.defaultSession;
    const result = await clearSafeSessionCache(targetSession);
    appendDiagnostic('info', 'maintenance', 'Безопасный кэш NightGram очищен.', result);
    return result;
  });
  ipcMain.handle('desktop:get-update-state', () => updateManager?.getState() || null);
  ipcMain.handle('desktop:check-for-updates', () => updateManager?.checkForUpdates() || null);
  ipcMain.handle('desktop:download-update', () => updateManager?.downloadUpdate() || null);
  ipcMain.handle('desktop:install-update', () => updateManager?.installUpdate() || null);
  ipcMain.handle('desktop:open-update-folder', () => updateManager?.openUpdateFolder() || null);
  ipcMain.handle('desktop:restart', () => {
    appendDiagnostic('info', 'lifecycle', 'Перезапуск запрошен пользователем.');
    isQuitting = true;
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle('desktop:quit', () => quitApplication());
}

process.on('unhandledRejection', (reason) => {
  appendDiagnostic('error', 'main-process', 'Необработанное отклонение Promise.', reason);
});

process.on('uncaughtException', (error) => {
  appendDiagnostic('fatal', 'main-process', 'Необработанное исключение Electron main process.', error);
  try {
    dialog.showErrorBox('NightGram завершает работу', 'Произошла критическая ошибка. Диагностический журнал сохранён.');
  } finally {
    isQuitting = true;
    app.exit(1);
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  app.whenReady().then(async () => {
    diagnosticsReady = true;
    fs.mkdirSync(diagnosticsDirectory(), { recursive: true });
    initializeSessionState();
    initializeInstallState();
    flushEarlyDiagnostics();
    applyInstallerPreferences();
    appendDiagnostic('info', 'lifecycle', 'NightGram запущен.', {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
      previousSessionUnclean,
    });

    app.setAppUserModelId('app.nightgram.desktop');
    updateManager = createUpdateManager({ appendDiagnostic, readDesktopSettings, getIconPath, quitApplication });
    registerDesktopIpc();
    const settings = readDesktopSettings();
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: process.execPath });
    createApplicationMenu();
    createTray();
    updateManager.scheduleAutomaticChecks();

    try {
      await createMainWindow();
    } catch (error) {
      appendDiagnostic('fatal', 'startup', 'NightGram не смог создать главное окно.', error);
      dialog.showErrorBox('NightGram не запустился', error instanceof Error ? error.message : String(error));
      quitApplication();
    }
  });
}

app.on('activate', () => {
  if (mainWindow) showMainWindow();
  else createMainWindow().catch((error) => {
    appendDiagnostic('error', 'window', 'Не удалось повторно создать главное окно.', error);
    dialog.showErrorBox('NightGram', String(error));
  });
});

app.on('child-process-gone', (_event, details) => {
  appendDiagnostic(details.reason === 'clean-exit' ? 'info' : 'error', 'child-process', 'Дочерний процесс Electron завершился.', details);
});

app.on('before-quit', () => {
  isQuitting = true;
  writeSessionState(true);
  appendDiagnostic('info', 'lifecycle', 'NightGram завершает работу.');
  updateManager?.dispose();
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

app.on('window-all-closed', () => {
  // На Windows приложение остаётся доступным в системном трее.
});

module.exports = {
  normalizeDesktopSettings,
  normalizeWebPreferences,
  applyInstallerPreferences,
};
