const fs = require('node:fs');

const MAX_INSTALLER_PREFERENCES_BYTES = 4096;

function consumeInstallerPreferences({ markerPath, currentSettings, writeSettings }) {
  if (!markerPath || !fs.existsSync(markerPath)) {
    return { applied: false, reason: 'missing' };
  }

  try {
    const stat = fs.statSync(markerPath);
    if (stat.size > MAX_INSTALLER_PREFERENCES_BYTES) {
      throw new Error('Installer preferences file is unexpectedly large.');
    }

    const payload = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    if (typeof payload?.launchAtLogin !== 'boolean') {
      throw new Error('Installer preferences do not contain a valid launchAtLogin value.');
    }
    if (typeof writeSettings !== 'function') {
      throw new TypeError('writeSettings must be a function.');
    }

    const settings = writeSettings({
      ...(currentSettings && typeof currentSettings === 'object' ? currentSettings : {}),
      launchAtLogin: payload.launchAtLogin,
    });
    return { applied: true, settings, launchAtLogin: payload.launchAtLogin };
  } catch (error) {
    return { applied: false, reason: 'invalid', error };
  } finally {
    try {
      fs.rmSync(markerPath, { force: true });
    } catch {
      // A stale marker is harmless; the caller can record diagnostics if needed.
    }
  }
}

module.exports = {
  MAX_INSTALLER_PREFERENCES_BYTES,
  consumeInstallerPreferences,
};
