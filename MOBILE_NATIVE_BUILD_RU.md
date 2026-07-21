# Сборка нативных приложений NightGram 3.4.0

## Требования

Общее:

- Node.js 22 или новее;
- npm 10 или новее;
- опубликованный HTTPS frontend NightGram;
- обновлённый backend 3.4.0;
- актуальные миграции Supabase.

Android:

- Android Studio Otter 2025.2.1 или новее;
- JDK 21;
- Android SDK 36;
- minSdk 24, targetSdk 36.

iOS:

- Mac;
- Xcode 26 или новее;
- Apple Developer Program;
- iOS deployment target 15.0+.

## Общая конфигурация

Создайте `.env.native`:

```env
NIGHTGRAM_MOBILE_URL=https://app.your-domain.tld
NIGHTGRAM_MOBILE_ALLOW_NAVIGATION=app.your-domain.tld
NIGHTGRAM_ANDROID_APP_ID=app.nightgram.mobile
NIGHTGRAM_IOS_BUNDLE_ID=app.nightgram.mobile
```

После изменения файла выполните:

```bash
npm ci
npm run native:sync
```

Команда обновляет Capacitor, App Links, Associated Domains, версии и Bundle/Application ID.

## Debug Android APK

```bat
BUILD_ANDROID_DEBUG_APK.bat
```

Установить через ADB:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Release Android AAB

Создайте ключ один раз:

```bash
keytool -genkeypair -v -keystore android/nightgram-release.jks -alias nightgram -keyalg RSA -keysize 2048 -validity 10000
```

Скопируйте:

```text
android/keystore.properties.example → android/keystore.properties
```

Заполните пароли. Затем:

```bat
BUILD_ANDROID_AAB.bat
```

Никогда не теряйте JKS и пароли: без них нельзя штатно обновлять опубликованное приложение.

## iOS

На Mac:

```bash
chmod +x OPEN_IOS_XCODE.command
./OPEN_IOS_XCODE.command
```

В Xcode:

1. App → Signing & Capabilities.
2. Выберите Team.
3. Убедитесь, что Bundle Identifier совпадает с `.env.native` и Apple Developer App ID.
4. Добавьте Push Notifications.
5. В Background Modes включите Audio, Voice over IP и Remote notifications.
6. Проверьте Associated Domains: `applinks:ваш-домен`.
7. Выберите реальный iPhone и запустите приложение.
8. Для публикации: Product → Archive.

## Проверка перед магазином

- вход и регистрация;
- личные и групповые чаты;
- загрузка фото/видео/файлов;
- камера и микрофон;
- звонок Android ↔ Android;
- Android ↔ iPhone;
- iPhone ↔ iPhone;
- входящий звонок при заблокированном iPhone;
- уведомления при закрытом приложении;
- глубокая ссылка в нужный чат;
- TURN в мобильной сети и за CGNAT;
- удаление аккаунта;
- политика конфиденциальности внутри приложения.

## Архитектура и демонстрация экрана

Это гибридные нативные приложения Capacitor: APK/AAB и iOS Archive являются настоящими пакетами Android/iOS, а основной интерфейс загружается с вашего HTTPS frontend. Нативные разрешения, push, deep links, foreground call service и CallKit работают через платформенные проекты.

Мобильная демонстрация экрана в версии 3.4.0 не гарантируется: для полноценного релиза нужен отдельный плагин Android MediaProjection и iOS ReplayKit Broadcast Upload Extension. До этого экран можно надёжно демонстрировать из Windows-версии, а на телефонах функция зависит от поддержки WebView.
