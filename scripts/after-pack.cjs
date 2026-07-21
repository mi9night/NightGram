const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const REQUIRED = [
  'server.js',
  'package.json',
  path.join('node_modules', 'next', 'package.json'),
  path.join('node_modules', 'react', 'package.json'),
  path.join('node_modules', 'react-dom', 'package.json'),
  path.join('.next', 'BUILD_ID'),
];

function assertRuntime(runtimeRoot, label) {
  for (const relative of REQUIRED) {
    const target = path.join(runtimeRoot, relative);
    if (!fs.existsSync(target)) {
      throw new Error(`${label} is incomplete: missing ${target}`);
    }
  }

  const requireFromServer = createRequire(path.join(runtimeRoot, 'server.js'));
  for (const packageName of ['next/package.json', 'react/package.json', 'react-dom/package.json']) {
    try {
      requireFromServer.resolve(packageName);
    } catch (error) {
      throw new Error(`${label} cannot resolve ${packageName}: ${error.message}`);
    }
  }
}

module.exports = async function afterPack(context) {
  const sourceRuntime = path.join(context.packager.projectDir, 'desktop-runtime', 'app');
  const packagedRuntime = path.join(context.appOutDir, 'resources', 'app');

  assertRuntime(sourceRuntime, 'Source desktop runtime');

  // electron-builder may apply generic node_modules exclusions while processing
  // extraResources. Copy the standalone runtime once more after packing and
  // materialize symlinks so the installed server is fully self-contained.
  fs.rmSync(packagedRuntime, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(packagedRuntime), { recursive: true });
  fs.cpSync(sourceRuntime, packagedRuntime, {
    recursive: true,
    force: true,
    dereference: true,
    errorOnExist: false,
  });

  assertRuntime(packagedRuntime, 'Packaged desktop runtime');
  fs.writeFileSync(
    path.join(packagedRuntime, 'nightgram-runtime.json'),
    JSON.stringify({
      version: context.packager.appInfo.version,
      verifiedAt: new Date().toISOString(),
      nextIncluded: true,
    }, null, 2),
    'utf8',
  );

  console.log(`NightGram packaged runtime verified: ${packagedRuntime}`);
};
