import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { consumeInstallerPreferences } = require('../desktop/installer-preferences.cjs');
const temp = await mkdtemp(path.join(os.tmpdir(), 'nightgram-installer-preferences-'));

try {
  for (const launchAtLogin of [true, false]) {
    const marker = path.join(temp, `installer-${launchAtLogin}.json`);
    await writeFile(marker, JSON.stringify({ launchAtLogin }), 'utf8');
    let saved = null;
    const result = consumeInstallerPreferences({
      markerPath: marker,
      currentSettings: { closeToTray: true, launchAtLogin: !launchAtLogin },
      writeSettings(value) {
        saved = value;
        return value;
      },
    });
    assert.equal(result.applied, true);
    assert.equal(result.launchAtLogin, launchAtLogin);
    assert.equal(saved.launchAtLogin, launchAtLogin);
    assert.equal(saved.closeToTray, true);
    await assert.rejects(readFile(marker, 'utf8'));
  }

  const invalidMarker = path.join(temp, 'invalid.json');
  await writeFile(invalidMarker, '{broken', 'utf8');
  const invalid = consumeInstallerPreferences({
    markerPath: invalidMarker,
    currentSettings: {},
    writeSettings: (value) => value,
  });
  assert.equal(invalid.applied, false);
  assert.equal(invalid.reason, 'invalid');
  await assert.rejects(readFile(invalidMarker, 'utf8'));

  const missing = consumeInstallerPreferences({
    markerPath: path.join(temp, 'missing.json'),
    currentSettings: {},
    writeSettings: (value) => value,
  });
  assert.deepEqual(missing, { applied: false, reason: 'missing' });

  console.log('Installer preferences tests passed: enabled, disabled, invalid and missing markers.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
