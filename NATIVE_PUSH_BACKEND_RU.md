# Backend нативных уведомлений

В Supabase выполните:

```text
supabase/migration_native_mobile_apps.sql
```

Затем разверните обновлённую папку `backend`.

## Android FCM

```env
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=
```

## iOS APNs/VoIP

```env
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_PRIVATE_KEY=
APNS_BUNDLE_ID=app.nightgram.mobile
APNS_PRODUCTION=false
```

## Что отправляет backend

- Web Push — установленным PWA и браузерам;
- FCM HTTP v1 — Android;
- APNs alert — обычным iOS-уведомлениям;
- APNs VoIP — PushKit/CallKit входящим звонкам;
- скрытый `end-call` — завершает системный экран CallKit после окончания звонка.

Тихие часы и пользовательские настройки применяются ко всем трём каналам.
