# NightGram 3.0.0 — рабочие звонки и демонстрация экрана

## Что исправлено и добавлено

### WebRTC

- аудио- и видеозвонки 1:1 через глобальный менеджер звонка;
- отдельная очередь ICE-кандидатов для каждого звонка и собеседника;
- сохранение кандидатов, пришедших раньше offer/incoming;
- повторное согласование соединения без уничтожения рабочего peer connection;
- ICE restart после временного обрыва сети;
- восстановление соединения выполняет caller, что уменьшает offer collision;
- корректный переход в active только после реального WebRTC connection state;
- fallback видеозвонка в аудиорежим, если камера занята или отсутствует;
- понятные сообщения об ошибках разрешений и устройств;
- глобальное окно звонка продолжает работать при переходе между разделами.

### TURN

- новый защищённый маршрут backend: `GET /api/calls/ice-config`;
- STUN/TURN-конфигурация загружается во время работы приложения;
- поддерживаются постоянные TURN credentials;
- предпочтительный режим — краткоживущие coturn REST credentials через `TURN_SHARED_SECRET`;
- постоянный TURN secret не попадает в frontend;
- добавлен готовый шаблон `turn/docker-compose.yml` и `turn/turnserver.conf.example`.

### Демонстрация экрана

- замена camera track на screen track через `RTCRtpSender.replaceTrack`;
- screen sharing работает и во время аудиозвонка;
- при завершении системного захвата камера восстанавливается автоматически;
- исправлена ошибка, при которой `screenTrack.onended` мог не остановить демонстрацию;
- добавлено повторное согласование, если video sender ещё не существовал;
- Windows Electron показывает выбор конкретного экрана или окна;
- Electron выдаёт только необходимые разрешения `media` и `display-capture` для локального origin NightGram;
- включено автоматическое воспроизведение звука удалённого собеседника.

### Mobile PWA

- добавлена подсказка установки приложения на Android и iOS;
- Android получает кнопку «Установить» при доступном browser install prompt;
- iOS показывает инструкцию «Поделиться → На экран Домой»;
- добавлены BAT-файлы локального запуска;
- в итоговый архив включён готовый standalone PWA-server.

## Railway backend

Разверните обновлённую папку `backend` и добавьте переменные:

```env
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
TURN_SHARED_SECRET=длинный_случайный_секрет
TURN_TTL_SECONDS=3600
```

Секрет должен совпадать с `static-auth-secret` в coturn.

## Supabase

Новая SQL-миграция для NightGram 3.0.0 не требуется.

## Windows

Сборка установщика:

```bat
BUILD_PC_INSTALLER.bat
```

Ожидаемый файл:

```text
release\NightGram-Setup-3.0.0-x64.exe
```

## Mobile

Полная инструкция находится в `MOBILE_VERSION_START_RU.md`.

Для локального просмотра:

```bat
START_MOBILE_PWA.bat
```

Для звонков на телефоне используйте опубликованный HTTPS-домен и развёрнутый backend 3.0.0.
