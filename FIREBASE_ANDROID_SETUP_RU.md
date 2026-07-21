# Firebase и Google Play для Android

## 1. Firebase

1. Создайте Firebase project.
2. Добавьте Android app с package name из `NIGHTGRAM_ANDROID_APP_ID`.
3. Скачайте `google-services.json`.
4. Поместите его строго сюда:

```text
android/app/google-services.json
```

5. В Firebase Cloud Messaging убедитесь, что включён HTTP v1 API.

## 2. Service account для backend

В Google Cloud/Firebase создайте service account с правом отправки Firebase Cloud Messaging и скачайте JSON. Из него перенесите на Railway:

```env
FCM_PROJECT_ID=project_id
FCM_CLIENT_EMAIL=client_email
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Сам JSON в репозиторий не добавляйте.

## 3. Подпись

Создайте `android/nightgram-release.jks`, затем `android/keystore.properties`:

```properties
storeFile=nightgram-release.jks
storePassword=ВАШ_ПАРОЛЬ
keyAlias=nightgram
keyPassword=ВАШ_ПАРОЛЬ
```

## 4. App Links

После получения SHA-256 сертификата замените значения в:

```text
public/.well-known/assetlinks.json.example
```

Опубликуйте файл как:

```text
https://app.your-domain.tld/.well-known/assetlinks.json
```

MIME type должен быть `application/json`, без перенаправления на HTML.

## 5. Google Play

Соберите:

```bat
BUILD_ANDROID_AAB.bat
```

Загрузите `app-release.aab` сначала во Internal testing. Заполните Data safety, возрастной рейтинг, политику конфиденциальности, описание разрешений камеры/микрофона и инструкции тестового аккаунта.
