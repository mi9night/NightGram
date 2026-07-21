import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const nsis = packageJson?.build?.nsis || {};

if (nsis.oneClick !== false) {
  throw new Error('Installer choices require the assisted NSIS installer (build.nsis.oneClick=false).');
}
if (nsis.include !== 'build/installer.nsh') {
  throw new Error('build.nsis.include must point to build/installer.nsh.');
}
if (nsis.createDesktopShortcut !== true || nsis.createStartMenuShortcut !== true) {
  throw new Error('electron-builder shortcut support must remain enabled; the custom page applies the user selection after installation.');
}
if (nsis.runAfterFinish !== true) {
  throw new Error('build.nsis.runAfterFinish=true is required for the final launch-after-install checkbox.');
}

const script = await readFile(path.join(root, 'build', 'installer.nsh'), 'utf8');
const requiredFragments = [
  '!macro customPageAfterChangeDir',
  'NightGramOptionsPageCreate',
  'NightGramOptionsPageLeave',
  'Создать ярлык в меню «Пуск»',
  'Создать ярлык на рабочем столе',
  'Запускать NightGram вместе с Windows',
  'installer-preferences.json',
  'launchAtLogin',
  '!macro customInstall',
  '!macro customUnInstall',
  'WinShell::SetLnkAUMI',
  '${IfNot} ${Silent}',
  '!macro customUnInstallSection',
  'Очистить временный кэш (сохраняет вход и настройки)',
  'Удалить все локальные данные (выход из аккаунта)',
  'Section /o',
  '${IfNot} ${isUpdated}',
  'NightGramClearCacheRoot',
];

for (const fragment of requiredFragments) {
  if (!script.includes(fragment)) {
    throw new Error(`Installer options page is incomplete: missing ${fragment}`);
  }
}


const mainProcess = await readFile(path.join(root, 'desktop', 'main.cjs'), 'utf8');
for (const fragment of [
  'function installerPreferencesFile()',
  'function applyInstallerPreferences()',
  "require('./installer-preferences.cjs')",
  'applyInstallerPreferences();',
  'result.launchAtLogin',
]) {
  if (!mainProcess.includes(fragment)) {
    throw new Error(`Desktop installer-preferences integration is incomplete: missing ${fragment}`);
  }
}

const installerPreferences = await readFile(path.join(root, 'desktop', 'installer-preferences.cjs'), 'utf8');
for (const fragment of [
  'function consumeInstallerPreferences',
  'launchAtLogin: payload.launchAtLogin',
  "fs.rmSync(markerPath, { force: true })",
  "reason: 'invalid'",
]) {
  if (!installerPreferences.includes(fragment)) {
    throw new Error(`Installer preferences module is incomplete: missing ${fragment}`);
  }
}



const preload = await readFile(path.join(root, 'desktop', 'preload.cjs'), 'utf8');
const desktopTypes = await readFile(path.join(root, 'src', 'types', 'desktop.d.ts'), 'utf8');
const desktopSettingsCard = await readFile(path.join(root, 'src', 'components', 'desktop', 'DesktopSettingsCard.tsx'), 'utf8');
const cacheMaintenance = await readFile(path.join(root, 'desktop', 'cache-maintenance.cjs'), 'utf8');

for (const [label, content, fragments] of [
  ['main process', mainProcess, ["require('./cache-maintenance.cjs')", "ipcMain.handle('desktop:clear-cache'", 'clearSafeSessionCache']],
  ['preload bridge', preload, ["clearCache: () => ipcRenderer.invoke('desktop:clear-cache')"]],
  ['desktop types', desktopTypes, ['clearCache(): Promise<']],
  ['settings UI', desktopSettingsCard, ['Очистить временный кэш NightGram?', 'Очистить кэш', 'bridge!.clearCache()']],
  ['cache module', cacheMaintenance, ["['shadercache', 'serviceworkers', 'cachestorage']", "preserved: ['cookies', 'localstorage', 'indexdb']"]],
]) {
  for (const fragment of fragments) {
    if (!content.includes(fragment)) throw new Error(`${label} cache integration is incomplete: missing ${fragment}`);
  }
}

console.log(`Installer configuration verified for NightGram ${packageJson.version}: install, uninstall, cache and startup choices are enabled.`);
