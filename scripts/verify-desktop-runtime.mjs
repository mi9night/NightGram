import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const root = process.cwd();
const runtime = path.join(root, 'desktop-runtime', 'app');
const requiredFiles = [
  'server.js',
  'package.json',
  path.join('node_modules', 'next', 'package.json'),
  path.join('node_modules', 'react', 'package.json'),
  path.join('node_modules', 'react-dom', 'package.json'),
  path.join('.next', 'BUILD_ID'),
  path.join('.next', 'static'),
  'public',
];

for (const relative of requiredFiles) {
  const target = path.join(runtime, relative);
  try {
    await access(target);
  } catch {
    throw new Error(`Desktop runtime incomplete: missing ${relative}. Do not create the installer.`);
  }
}

const requireFromServer = createRequire(path.join(runtime, 'server.js'));
for (const packageName of ['next/package.json', 'react/package.json', 'react-dom/package.json']) {
  try {
    requireFromServer.resolve(packageName);
  } catch (error) {
    throw new Error(`Desktop runtime cannot resolve ${packageName} from server.js: ${error.message}`);
  }
}

const nextPackage = JSON.parse(await readFile(path.join(runtime, 'node_modules', 'next', 'package.json'), 'utf8'));
console.log(`Desktop runtime verified: Next.js ${nextPackage.version}; server dependencies are self-contained.`);
