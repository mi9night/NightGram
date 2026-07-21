async function getCacheSizeSafe(targetSession) {
  if (!targetSession || typeof targetSession.getCacheSize !== 'function') return 0;
  try {
    const value = await targetSession.getCacheSize();
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

async function clearSafeSessionCache(targetSession) {
  if (!targetSession || typeof targetSession.clearCache !== 'function') {
    throw new TypeError('A valid Electron Session is required.');
  }

  const beforeBytes = await getCacheSizeSafe(targetSession);
  await targetSession.clearCache();

  if (typeof targetSession.clearCodeCaches === 'function') {
    await targetSession.clearCodeCaches({ urls: [] });
  }

  if (typeof targetSession.clearStorageData === 'function') {
    await targetSession.clearStorageData({
      storages: ['shadercache', 'serviceworkers', 'cachestorage'],
    });
  }

  if (typeof targetSession.clearHostResolverCache === 'function') {
    await targetSession.clearHostResolverCache();
  }

  const afterBytes = await getCacheSizeSafe(targetSession);
  return {
    beforeBytes,
    afterBytes,
    freedBytes: Math.max(0, beforeBytes - afterBytes),
    preserved: ['cookies', 'localstorage', 'indexdb'],
  };
}

module.exports = {
  clearSafeSessionCache,
  getCacheSizeSafe,
};
