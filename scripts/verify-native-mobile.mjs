import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
function check(name, fn) {
  fn();
  checks.push(name);
  console.log(`✓ ${name}`);
}

const pkg = JSON.parse(read("package.json"));
check("Capacitor 8 dependencies", () => {
  assert.equal(pkg.version, "3.4.0");
  assert.match(pkg.dependencies["@capacitor/core"], /^8\./);
  assert.match(pkg.devDependencies["@capacitor/android"], /^8\./);
  assert.match(pkg.devDependencies["@capacitor/ios"], /^8\./);
});

check("Android native project", () => {
  assert.ok(exists("android/gradlew.bat"));
  assert.ok(exists("android/app/src/main/java/app/nightgram/mobile/MainActivity.java"));
  const variables = read("android/variables.gradle");
  assert.match(variables, /minSdkVersion = 24/);
  assert.match(variables, /compileSdkVersion = 36/);
  assert.match(variables, /targetSdkVersion = 36/);
});

check("Android permissions and deep links", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  for (const permission of ["CAMERA", "RECORD_AUDIO", "POST_NOTIFICATIONS", "WAKE_LOCK"]) assert.ok(manifest.includes(`android.permission.${permission}`));
  assert.match(manifest, /android:scheme="nightgram"/);
  assert.match(manifest, /android:autoVerify="true"/);
  const activity = read("android/app/src/main/java/app/nightgram/mobile/MainActivity.java");
  assert.match(activity, /nightgram_messages/);
  assert.match(activity, /nightgram_calls/);
  assert.match(activity, /NightGramCallServicePlugin/);
  assert.ok(exists("android/app/src/main/java/app/nightgram/mobile/calls/NightGramCallService.java"));
  assert.ok(exists("android/app/src/main/java/app/nightgram/mobile/calls/NightGramCallServicePlugin.java"));
});

check("iOS native project, PushKit and CallKit", () => {
  assert.ok(exists("ios/App/App.xcodeproj/project.pbxproj"));
  const delegate = read("ios/App/App/AppDelegate.swift");
  assert.match(delegate, /import PushKit/);
  assert.match(delegate, /import CallKit/);
  assert.match(delegate, /reportNewIncomingCall/);
  assert.match(delegate, /nightgram:native-voip-token/);
  assert.match(delegate, /capacitorDidRegisterForRemoteNotifications/);
  assert.match(delegate, /capacitorDidFailToRegisterForRemoteNotifications/);
  const info = read("ios/App/App/Info.plist");
  assert.match(info, /NSCameraUsageDescription/);
  assert.match(info, /NSMicrophoneUsageDescription/);
  assert.match(info, /<string>voip<\/string>/);
  const entitlements = read("ios/App/App/App.entitlements");
  assert.ok(exists("ios/App/App/PrivacyInfo.xcprivacy"));
  assert.match(entitlements, /aps-environment/);
  assert.match(entitlements, /applinks:/);
});

check("Native web bridge", () => {
  const bridge = read("src/components/native/NativeMobileBridge.tsx");
  assert.match(bridge, /PushNotifications\.register/);
  assert.match(bridge, /saveNativePushToken/);
  assert.match(bridge, /appUrlOpen/);
  assert.match(bridge, /networkStatusChange/);
  assert.match(bridge, /nightgram:native-call-action/);
});

check("Native push backend and database migration", () => {
  const route = read("backend/src/routes/notifications.js");
  assert.match(route, /\/native-tokens/);
  assert.match(route, /\/native-config/);
  const nativePush = read("backend/src/lib/native-push.js");
  assert.match(nativePush, /firebase\.messaging/);
  assert.match(nativePush, /api\.push\.apple\.com/);
  assert.match(nativePush, /apns-push-type/);
  const migration = read("supabase/migration_native_mobile_apps.sql");
  assert.match(migration, /create table if not exists public\.native_push_tokens/);
  assert.match(migration, /unique \(platform, token\)/);
});

check("Store build scripts", () => {
  for (const file of ["BUILD_ANDROID_DEBUG_APK.bat", "BUILD_ANDROID_AAB.bat", "OPEN_ANDROID_STUDIO.bat", "OPEN_IOS_XCODE.command"]) assert.ok(exists(file));
  assert.ok(exists("android/keystore.properties.example"));
  assert.ok(exists(".env.native.example"));
});

console.log(`Native mobile verification: ${checks.length}/${checks.length} passed`);
