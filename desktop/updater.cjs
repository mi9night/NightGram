const { app, BrowserWindow, dialog, shell, Notification } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const UPDATE_EVENT = 'desktop:update-state';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 20 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;
const MAX_RELEASE_NOTES = 1800;
const DEFAULT_OWNER = 'mi9night';
const DEFAULT_REPOSITORY = 'NightGram';

function normalizeVersion(value) {
  const match = String(value || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumber = /^\d+$/.test(a) ? Number(a) : null;
    const bNumber = /^\d+$/.test(b) ? Number(b) : null;
    if (aNumber !== null && bNumber !== null) return aNumber > bNumber ? 1 : -1;
    if (aNumber !== null) return -1;
    if (bNumber !== null) return 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

function compareVersions(left, right) {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  if (!a || !b) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] > b[key]) return 1;
    if (a[key] < b[key]) return -1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function releaseVersion(release) {
  return String(release?.tag_name || release?.name || '').replace(/^v/i, '').trim();
}

function selectRelease(payload, channel = 'stable') {
  const releases = Array.isArray(payload) ? payload : [payload];
  return releases
    .filter((release) => release && !release.draft && (channel === 'beta' || !release.prerelease))
    .filter((release) => normalizeVersion(releaseVersion(release)))
    .sort((left, right) => {
      const versionOrder = compareVersions(releaseVersion(right), releaseVersion(left));
      if (versionOrder !== 0) return versionOrder;
      return String(right.published_at || right.created_at || '').localeCompare(String(left.published_at || left.created_at || ''));
    })[0] || null;
}

function sanitizeReleaseNotes(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, MAX_RELEASE_NOTES);
}

function request(url, { headers = {}, redirectCount = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get(parsed, {
      headers: {
        'User-Agent': `NightGram/${app.getVersion()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...headers,
      },
    }, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;
      if (location && statusCode >= 300 && statusCode < 400) {
        response.resume();
        if (redirectCount >= 5) {
          reject(new Error('Слишком много перенаправлений при проверке обновлений.'));
          return;
        }
        resolve(request(new URL(location, parsed).toString(), { headers, redirectCount: redirectCount + 1 }));
        return;
      }
      resolve(response);
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error('Истекло время ожидания сервера обновлений.')));
    req.on('error', reject);
  });
}

async function requestBuffer(url, options = {}) {
  const response = await request(url, options);
  const chunks = [];
  let size = 0;
  const maxBytes = options.maxBytes || 4 * 1024 * 1024;
  for await (const chunk of response) {
    size += chunk.length;
    if (size > maxBytes) {
      response.destroy();
      throw new Error('Ответ сервера обновлений слишком большой.');
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  if ((response.statusCode || 0) >= 400) {
    const error = new Error(`Сервер обновлений ответил ${response.statusCode}.`);
    error.statusCode = response.statusCode;
    error.body = body.toString('utf8').slice(0, 500);
    throw error;
  }
  return body;
}

async function requestJson(url) {
  const body = await requestBuffer(url);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('Сервер обновлений вернул некорректный JSON.');
  }
}

function parseChecksum(value, expectedFilename) {
  const text = String(value || '').trim();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})(?:\s+[* ]?(.+))?$/i);
    if (!match) continue;
    if (!match[2] || path.basename(match[2].trim()) === expectedFilename) return match[1].toLowerCase();
  }
  return null;
}

function createUpdateManager({ appendDiagnostic, readDesktopSettings, getIconPath, quitApplication }) {
  const owner = process.env.NIGHTGRAM_UPDATE_OWNER || DEFAULT_OWNER;
  const repository = process.env.NIGHTGRAM_UPDATE_REPOSITORY || DEFAULT_REPOSITORY;
  const stableApiUrl = process.env.NIGHTGRAM_UPDATE_API_URL || `https://api.github.com/repos/${owner}/${repository}/releases/latest`;
  const betaApiUrl = process.env.NIGHTGRAM_UPDATE_BETA_API_URL || `https://api.github.com/repos/${owner}/${repository}/releases?per_page=30`;
  const updateDirectory = path.join(app.getPath('userData'), 'updates');
  let automaticTimer = null;
  let startupTimer = null;
  let operationPromise = null;
  let internalRelease = null;
  let lastNotifiedVersion = null;
  let state = {
    status: process.platform === 'win32' ? 'idle' : 'unsupported',
    channel: readDesktopSettings().updateChannel === 'beta' ? 'beta' : 'stable',
    currentVersion: app.getVersion(),
    latestVersion: null,
    releaseName: null,
    releaseNotes: null,
    publishedAt: null,
    releaseUrl: null,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    installerPath: null,
    error: null,
    checkedAt: null,
  };

  function publicState() {
    return { ...state };
  }

  function emitState() {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(UPDATE_EVENT, publicState());
    }
  }

  function setState(patch) {
    state = { ...state, ...patch };
    emitState();
    return publicState();
  }

  function notify(title, body) {
    const settings = readDesktopSettings();
    if (!settings.nativeNotifications || !Notification.isSupported()) return;
    const notification = new Notification({ title, body, icon: getIconPath() });
    notification.on('click', () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });
    notification.show();
  }

  function cleanupOldInstallers(keepPath = null) {
    try {
      fs.mkdirSync(updateDirectory, { recursive: true });
      for (const entry of fs.readdirSync(updateDirectory)) {
        const candidate = path.join(updateDirectory, entry);
        if (candidate === keepPath || !/^NightGram-Setup-.*\.(?:exe|part)$/i.test(entry)) continue;
        fs.rmSync(candidate, { force: true });
      }
    } catch (error) {
      appendDiagnostic('warn', 'updater', 'Не удалось очистить старые файлы обновления.', error);
    }
  }

  async function checkForUpdates({ silent = false } = {}) {
    if (process.platform !== 'win32') return setState({ status: 'unsupported', error: null });
    if (operationPromise) return operationPromise;

    operationPromise = (async () => {
      const channel = readDesktopSettings().updateChannel === 'beta' ? 'beta' : 'stable';
      const apiUrl = channel === 'beta' ? betaApiUrl : stableApiUrl;
      setState({ status: 'checking', channel, error: null, progress: 0 });
      appendDiagnostic('info', 'updater', 'Проверка обновлений началась.', { apiUrl, channel, silent });
      try {
        const payload = await requestJson(apiUrl);
        const release = selectRelease(payload, channel);
        if (!release) throw new Error(channel === 'beta' ? 'Подходящий beta-релиз не найден.' : 'Последний публичный стабильный релиз не найден.');
        const latestVersion = releaseVersion(release);
        if (!normalizeVersion(latestVersion)) throw new Error('У релиза некорректный номер версии.');

        const assets = Array.isArray(release.assets) ? release.assets : [];
        const exactName = `NightGram-Setup-${latestVersion}-x64.exe`;
        const installerAsset = assets.find((asset) => asset?.name === exactName)
          || assets.find((asset) => /^NightGram-Setup-.*-x64\.exe$/i.test(String(asset?.name || '')));
        const checksumAsset = installerAsset
          ? assets.find((asset) => asset?.name === `${installerAsset.name}.sha256`)
            || assets.find((asset) => /\.sha256$/i.test(String(asset?.name || '')))
          : null;

        const baseState = {
          currentVersion: app.getVersion(),
          channel,
          latestVersion,
          releaseName: String(release.name || `NightGram ${latestVersion}`).slice(0, 200),
          releaseNotes: sanitizeReleaseNotes(release.body),
          publishedAt: release.published_at || null,
          releaseUrl: release.html_url || null,
          checkedAt: new Date().toISOString(),
          error: null,
          progress: 0,
          downloadedBytes: 0,
          totalBytes: Number(installerAsset?.size || 0),
          installerPath: null,
        };

        if (compareVersions(latestVersion, app.getVersion()) <= 0) {
          internalRelease = null;
          appendDiagnostic('info', 'updater', 'Установлена актуальная версия.', { current: app.getVersion(), latest: latestVersion });
          return setState({ ...baseState, status: 'up-to-date' });
        }
        if (!installerAsset?.browser_download_url) throw new Error(`В релизе ${latestVersion} нет Windows-установщика ${exactName}.`);
        if (!checksumAsset?.browser_download_url && !String(installerAsset.digest || '').startsWith('sha256:')) {
          throw new Error(`В релизе ${latestVersion} нет SHA-256 контрольной суммы.`);
        }

        internalRelease = {
          installerName: installerAsset.name,
          installerUrl: installerAsset.browser_download_url,
          checksumUrl: checksumAsset?.browser_download_url || null,
          digest: String(installerAsset.digest || '').replace(/^sha256:/i, '').toLowerCase() || null,
        };
        appendDiagnostic('info', 'updater', 'Доступно обновление.', { current: app.getVersion(), latest: latestVersion });
        if (silent && lastNotifiedVersion !== latestVersion) {
          lastNotifiedVersion = latestVersion;
          notify('Доступно обновление NightGram', `Версия ${latestVersion} (${channel === 'beta' ? 'beta' : 'stable'}) готова к установке.`);
        }
        return setState({ ...baseState, status: 'available' });
      } catch (error) {
        const noRelease = error?.statusCode === 404;
        const message = noRelease ? (channel === 'beta' ? 'Beta-релизов NightGram пока нет.' : 'Публичных релизов NightGram пока нет.') : (error instanceof Error ? error.message : String(error));
        appendDiagnostic(noRelease ? 'info' : 'warn', 'updater', 'Проверка обновлений не завершена.', { message });
        return setState({ status: noRelease ? 'up-to-date' : 'error', error: noRelease ? null : message, checkedAt: new Date().toISOString() });
      } finally {
        operationPromise = null;
      }
    })();
    return operationPromise;
  }

  async function resolveExpectedChecksum() {
    if (!internalRelease) throw new Error('Сначала выполните проверку обновлений.');
    if (/^[a-f0-9]{64}$/i.test(internalRelease.digest || '')) return internalRelease.digest;
    if (!internalRelease.checksumUrl) throw new Error('У релиза отсутствует контрольная сумма SHA-256.');
    const checksumBody = await requestBuffer(internalRelease.checksumUrl, { maxBytes: 128 * 1024 });
    const expected = parseChecksum(checksumBody.toString('utf8'), internalRelease.installerName);
    if (!expected) throw new Error('Не удалось прочитать контрольную сумму обновления.');
    return expected;
  }

  async function downloadFile(url, destination, expectedHash) {
    const response = await request(url, { headers: { Accept: 'application/octet-stream' } });
    if ((response.statusCode || 0) >= 400) {
      response.resume();
      throw new Error(`Не удалось скачать обновление: HTTP ${response.statusCode}.`);
    }
    const totalBytes = Number(response.headers['content-length'] || state.totalBytes || 0);
    const temporaryPath = `${destination}.part`;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.rmSync(temporaryPath, { force: true });

    const hash = crypto.createHash('sha256');
    const output = fs.createWriteStream(temporaryPath, { flags: 'wx' });
    let downloadedBytes = 0;
    let lastEmission = 0;
    const meter = new Transform({
      transform(chunk, _encoding, callback) {
        downloadedBytes += chunk.length;
        hash.update(chunk);
        const now = Date.now();
        if (now - lastEmission > 250) {
          lastEmission = now;
          setState({
            status: 'downloading',
            downloadedBytes,
            totalBytes,
            progress: totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0,
          });
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(response, meter, output);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      throw error;
    }

    const actualHash = hash.digest('hex').toLowerCase();
    if (actualHash !== expectedHash.toLowerCase()) {
      fs.rmSync(temporaryPath, { force: true });
      throw new Error('Контрольная сумма обновления не совпала. Файл удалён.');
    }
    fs.rmSync(destination, { force: true });
    fs.renameSync(temporaryPath, destination);
    return { downloadedBytes, totalBytes: totalBytes || downloadedBytes, actualHash };
  }

  async function downloadUpdate() {
    if (operationPromise) return operationPromise;
    if (!internalRelease || state.status !== 'available') {
      const checked = await checkForUpdates();
      if (!internalRelease || checked.status !== 'available') return checked;
    }
    if (operationPromise) return operationPromise;

    operationPromise = (async () => {
      try {
        const expectedHash = await resolveExpectedChecksum();
        const destination = path.join(updateDirectory, path.basename(internalRelease.installerName));
        cleanupOldInstallers(destination);
        setState({ status: 'downloading', progress: 0, downloadedBytes: 0, installerPath: null, error: null });
        appendDiagnostic('info', 'updater', 'Скачивание обновления началось.', { version: state.latestVersion, destination });
        const result = await downloadFile(internalRelease.installerUrl, destination, expectedHash);
        appendDiagnostic('info', 'updater', 'Обновление скачано и проверено.', {
          version: state.latestVersion,
          bytes: result.downloadedBytes,
          sha256: result.actualHash,
        });
        notify('Обновление NightGram загружено', `Версия ${state.latestVersion} готова к установке.`);
        return setState({
          status: 'downloaded',
          progress: 100,
          downloadedBytes: result.downloadedBytes,
          totalBytes: result.totalBytes,
          installerPath: destination,
          error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendDiagnostic('error', 'updater', 'Не удалось скачать обновление.', { message });
        return setState({ status: 'error', error: message });
      } finally {
        operationPromise = null;
      }
    })();
    return operationPromise;
  }

  async function installUpdate() {
    const installerPath = state.installerPath;
    if (!installerPath || !fs.existsSync(installerPath)) {
      return setState({ status: 'error', error: 'Проверенный установщик обновления не найден.' });
    }
    const result = await dialog.showMessageBox(BrowserWindow.getAllWindows()[0], {
      type: 'question',
      title: 'Установить обновление NightGram',
      message: `Установить NightGram ${state.latestVersion}?`,
      detail: 'Приложение закроется, после чего запустится проверенный установщик.',
      buttons: ['Установить', 'Отмена'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response !== 0) return publicState();
    const openError = await shell.openPath(installerPath);
    if (openError) {
      appendDiagnostic('error', 'updater', 'Windows не смог запустить установщик обновления.', { openError, installerPath });
      return setState({ status: 'error', error: `Не удалось запустить установщик: ${openError}` });
    }
    appendDiagnostic('info', 'updater', 'Запущен установщик обновления.', { installerPath, latestVersion: state.latestVersion });
    setTimeout(() => quitApplication(), 500);
    return publicState();
  }

  function openUpdateFolder() {
    fs.mkdirSync(updateDirectory, { recursive: true });
    return shell.openPath(updateDirectory);
  }

  function settingsChanged() {
    internalRelease = null;
    const channel = readDesktopSettings().updateChannel === 'beta' ? 'beta' : 'stable';
    setState({
      status: process.platform === 'win32' ? 'idle' : 'unsupported',
      channel,
      latestVersion: null,
      releaseName: null,
      releaseNotes: null,
      publishedAt: null,
      releaseUrl: null,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      installerPath: null,
      error: null,
      checkedAt: null,
    });
    scheduleAutomaticChecks();
    return publicState();
  }

  function scheduleAutomaticChecks() {
    clearTimeout(startupTimer);
    clearInterval(automaticTimer);
    startupTimer = null;
    automaticTimer = null;
    if (!app.isPackaged || process.platform !== 'win32' || !readDesktopSettings().autoCheckUpdates) return;
    startupTimer = setTimeout(() => void checkForUpdates({ silent: true }), STARTUP_CHECK_DELAY_MS);
    automaticTimer = setInterval(() => void checkForUpdates({ silent: true }), CHECK_INTERVAL_MS);
    automaticTimer.unref?.();
  }

  function dispose() {
    clearTimeout(startupTimer);
    clearInterval(automaticTimer);
  }

  return {
    getState: publicState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    openUpdateFolder,
    settingsChanged,
    scheduleAutomaticChecks,
    dispose,
  };
}

module.exports = { createUpdateManager, compareVersions, parseChecksum, selectRelease };
