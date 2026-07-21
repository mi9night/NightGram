import { cp, mkdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');
const runtime = path.join(root, 'desktop-runtime', 'app');

async function assertExists(target, label) {
  try {
    await access(target);
  } catch {
    throw new Error(`${label} не найден: ${target}. Сначала выполните npm run build.`);
  }
}

await assertExists(standalone, 'Next.js standalone build');
await assertExists(staticDir, 'Next.js static assets');
await assertExists(path.join(standalone, 'server.js'), 'Next.js standalone server');
await assertExists(path.join(standalone, 'node_modules', 'next', 'package.json'), 'Next.js standalone dependency');

await rm(path.join(root, 'desktop-runtime'), { recursive: true, force: true });
await mkdir(runtime, { recursive: true });
await cp(standalone, runtime, { recursive: true, dereference: true });
await mkdir(path.join(runtime, '.next'), { recursive: true });
await cp(staticDir, path.join(runtime, '.next', 'static'), { recursive: true });
await cp(publicDir, path.join(runtime, 'public'), { recursive: true });

console.log(`Desktop runtime prepared: ${runtime}`);
