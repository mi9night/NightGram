# Apple Developer, APNs, PushKit и CallKit

## 1. App ID

В Apple Developer создайте Explicit App ID, совпадающий с `NIGHTGRAM_IOS_BUNDLE_ID`, например:

```text
app.nightgram.mobile
```

Включите Push Notifications и Associated Domains.

## 2. APNs key

Создайте APNs Auth Key `.p8`. Сохраните:

- Key ID;
- Team ID;
- содержимое `.p8`;
- Bundle ID.

Добавьте на Railway:

```env
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APNS_BUNDLE_ID=app.nightgram.mobile
APNS_PRODUCTION=false
```

Для TestFlight/App Store установите:

```env
APNS_PRODUCTION=true
```

NightGram регистрирует два iOS-токена:

- обычный APNs token — сообщения и события;
- PushKit VoIP token — входящие звонки и CallKit.

## 3. Universal Links

Заполните:

```text
public/.well-known/apple-app-site-association.example
```

Опубликуйте без расширения:

```text
https://app.your-domain.tld/.well-known/apple-app-site-association
```

Замените `REPLACE_TEAM_ID` на Team ID. Сервер должен отдавать JSON без перенаправления.

## 4. Xcode

На Mac запустите `OPEN_IOS_XCODE.command`.

В Signing & Capabilities проверьте:

- Push Notifications;
- Background Modes: Audio, Voice over IP, Remote notifications;
- Associated Domains;
- автоматическую или ручную подпись вашей Team.

## 5. Реальный iPhone обязателен

PushKit, APNs, камера, микрофон и реальное поведение CallKit нельзя полноценно проверить только в Simulator.

## 6. TestFlight

1. Product → Archive.
2. Distribute App → App Store Connect.
3. Загрузите в TestFlight.
4. Заполните экспортное шифрование, privacy labels и тестовый аккаунт.
5. Проверьте звонки на заблокированном устройстве перед внешним тестированием.

## Проверка обычных push и VoIP push

Обычный APNs token передаётся в Capacitor через `didRegisterForRemoteNotificationsWithDeviceToken`, а PushKit создаёт отдельный VoIP token. Проверьте оба типа на реальном iPhone: обычное сообщение при закрытом приложении и входящий звонок на заблокированном экране.
