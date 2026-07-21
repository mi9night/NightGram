import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envFile = path.join(root, '.env.native');
const exampleFile = path.join(root, '.env.native.example');

function parseEnv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    result[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return result;
}

const fileEnv = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
const env = { ...fileEnv, ...process.env };
const mobileUrl = String(env.NIGHTGRAM_MOBILE_URL || '').replace(/\/$/, '');
if (!/^https:\/\//i.test(mobileUrl) || /example\.com/i.test(mobileUrl)) {
  console.error('Укажите реальный HTTPS-домен в .env.native: NIGHTGRAM_MOBILE_URL=https://app.your-domain.tld');
  if (!fs.existsSync(envFile) && fs.existsSync(exampleFile)) fs.copyFileSync(exampleFile, envFile);
  process.exit(1);
}

const host = new URL(mobileUrl).hostname;
const allowNavigation = String(env.NIGHTGRAM_MOBILE_ALLOW_NAVIGATION || host)
  .split(',').map((item) => item.trim()).filter(Boolean);
const androidId = String(env.NIGHTGRAM_ANDROID_APP_ID || 'app.nightgram.mobile').trim();
const iosId = String(env.NIGHTGRAM_IOS_BUNDLE_ID || androidId).trim();

const config = `import type { CapacitorConfig } from '@capacitor/cli';\n\nconst config: CapacitorConfig = ${JSON.stringify({
  appId: androidId,
  appName: 'NightGram',
  webDir: 'native-shell',
  server: { url: mobileUrl, cleartext: false, allowNavigation },
  android: { allowMixedContent: false, backgroundColor: '#08070f' },
  ios: { contentInset: 'automatic', backgroundColor: '#08070f', preferredContentMode: 'mobile' },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#08070f', showSpinner: false },
    Keyboard: { resize: 'native' },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
    StatusBar: { style: 'DARK', backgroundColor: '#08070f', overlaysWebView: true },
  },
}, null, 2)};\n\nexport default config;\n`;
fs.writeFileSync(path.join(root, 'capacitor.config.ts'), config);

const androidGradle = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(androidGradle)) {
  let text = fs.readFileSync(androidGradle, 'utf8');
  text = text.replace(/applicationId\s+"[^"]+"/, `applicationId "${androidId}"`);
  text = text.replace(/versionName\s+"[^"]+"/, 'versionName "3.4.0"');
  text = text.replace(/versionCode\s+\d+/, 'versionCode 30400');
  fs.writeFileSync(androidGradle, text);
}

const pbx = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
if (fs.existsSync(pbx)) {
  let text = fs.readFileSync(pbx, 'utf8');
  text = text.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${iosId};`);
  text = text.replace(/MARKETING_VERSION = [^;]+;/g, 'MARKETING_VERSION = 3.4.0;');
  text = text.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, 'CURRENT_PROJECT_VERSION = 30400;');
  fs.writeFileSync(pbx, text);
}

const androidManifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
if (fs.existsSync(androidManifest)) {
  let text = fs.readFileSync(androidManifest, 'utf8');
  text = text.replace(/android:host="[^"]+"/g, `android:host="${host}"`);
  fs.writeFileSync(androidManifest, text);
}

const iosEntitlements = path.join(root, 'ios/App/App/App.entitlements');
if (fs.existsSync(iosEntitlements)) {
  let text = fs.readFileSync(iosEntitlements, 'utf8');
  text = text.replace(/<string>applinks:[^<]+<\/string>/g, `<string>applinks:${host}</string>`);
  fs.writeFileSync(iosEntitlements, text);
}

const iosInfo = path.join(root, 'ios/App/App/Info.plist');
if (fs.existsSync(iosInfo)) {
  let text = fs.readFileSync(iosInfo, 'utf8');
  text = text.replace(/<key>CFBundleURLName<\/key>\s*<string>[^<]+<\/string>/, `<key>CFBundleURLName</key>\n\t<string>${iosId}</string>`);
  fs.writeFileSync(iosInfo, text);
}

console.log(`Native config ready: ${mobileUrl}`);
console.log(`Android: ${androidId}; iOS: ${iosId}`);
