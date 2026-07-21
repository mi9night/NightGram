# NightGram 3.4.0 — Native Mobile Apps

Добавлено:

- Capacitor 8;
- Android Gradle project, API 36;
- iOS Xcode project, iOS 15+;
- FCM и APNs backend;
- iOS PushKit + CallKit;
- Android foreground service активного звонка;
- системные каналы Android;
- deep links и Universal/App Links;
- нативный status bar, splash, haptics, share и network bridge;
- store build scripts и release signing templates;
- миграция `migration_native_mobile_apps.sql`.

Нативные проекты используют опубликованный HTTPS frontend NightGram. Это позволяет обновлять серверную часть и интерфейс синхронно, сохраняя доступ к нативным SDK.

Не включены секреты Firebase/Apple и подписанные APK/AAB/IPA: они должны принадлежать владельцу приложения.

## Важное ограничение 3.4.0

Android и iOS — реальные подписываемые store-проекты, но интерфейс остаётся гибридным: Capacitor открывает опубликованный HTTPS frontend NightGram и добавляет нативные функции. Камера, микрофон, push и системные звонки интегрированы. Полноценная нативная демонстрация экрана на телефоне через Android MediaProjection и iOS ReplayKit в 3.4.0 ещё не реализована; браузерный `getDisplayMedia` зависит от WebView/версии ОС и не считается гарантированной функцией мобильного релиза.
