# NightGram 3.4.0 — настоящие Android и iOS приложения

В этом архиве находятся четыре версии одного NightGram:

- `android/` — настоящий Android-проект Gradle/Android Studio;
- `ios/` — настоящий iOS-проект Xcode с PushKit и CallKit;
- `desktop/` — Windows/Electron;
- Next.js frontend + Railway backend + PWA.

Мобильные проекты открывают опубликованный HTTPS frontend NightGram и используют нативный мост для системных функций. Поэтому перед сборкой сначала разместите frontend на публичном HTTPS-домене, например `https://app.your-domain.tld`.

> Архитектура 3.4.0 гибридная: Android APK/AAB и iOS Archive являются настоящими нативными пакетами, а основной интерфейс загружается с вашего HTTPS frontend через Capacitor. Полноценная нативная демонстрация экрана телефона через MediaProjection/ReplayKit остаётся отдельным этапом.

## Обязательная подготовка

1. Скопируйте `.env.native.example` в `.env.native`.
2. Укажите реальный адрес:

```env
NIGHTGRAM_MOBILE_URL=https://app.your-domain.tld
NIGHTGRAM_MOBILE_ALLOW_NAVIGATION=app.your-domain.tld
NIGHTGRAM_ANDROID_APP_ID=app.nightgram.mobile
NIGHTGRAM_IOS_BUNDLE_ID=app.nightgram.mobile
```

3. Выполните в Supabase:

```text
supabase/migration_native_mobile_apps.sql
```

4. Заново разверните папку `backend` на Railway.
5. Добавьте домен frontend в `CLIENT_ORIGINS` backend.
6. Настройте FCM/APNs по инструкциям из этого архива.

## Android

Для тестового APK на Windows:

```bat
BUILD_ANDROID_DEBUG_APK.bat
```

Результат:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

Для Google Play создайте ключ подписи, добавьте Firebase `google-services.json`, затем запустите:

```bat
BUILD_ANDROID_AAB.bat
```

Результат:

```text
android\app\build\outputs\bundle\release\app-release.aab
```

Подробности: `FIREBASE_ANDROID_SETUP_RU.md` и `MOBILE_NATIVE_BUILD_RU.md`.

## iPhone/iPad

iOS собирается только на Mac с Xcode 26 или новее:

```bash
./OPEN_IOS_XCODE.command
```

В Xcode выберите свою Apple Developer Team, проверьте Bundle Identifier и выполните:

```text
Product → Archive → Distribute App
```

Подробности: `APPLE_IOS_SETUP_RU.md`.

## Что уже нативное

- отдельные Android и iOS пакеты;
- системные разрешения камеры, микрофона, фото и уведомлений;
- FCM-токены Android;
- APNs-токены iOS;
- PushKit VoIP token и CallKit на iPhone;
- foreground service активного звонка на Android;
- deep links `nightgram://` и Universal/App Links;
- системный status bar, splash-screen, иконки, haptics, Share и состояние сети;
- отдельные системные каналы сообщений и звонков Android;
- серверная отправка Web Push + FCM + APNs.

## Что нельзя положить в общий архив

Не включайте в архив или Git:

- `android/app/google-services.json`;
- `android/nightgram-release.jks`;
- `android/keystore.properties`;
- Firebase service-account JSON;
- Apple `.p8` APNs key;
- пароли подписи;
- Apple provisioning profiles.

Без ваших ключей можно собрать интерфейс и debug APK, но push и публикация в магазинах не будут работать.
