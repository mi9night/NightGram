# NightGram 2.6.0 — защита публичной беты

## Что изменено

- Добавлены request ID для диагностики ошибок без показа внутренних данных пользователю.
- В production скрываются тексты ошибок Supabase/Postgres и stack traces.
- Общие JSON-маршруты ограничены 1 МБ; большой лимит оставлен только у авторизованной загрузки медиа.
- Загрузка проверяет MIME, base64, папку и реальный размер файла (до 50 МБ).
- Объекты Storage сохраняются в папке конкретного пользователя с UUID-именем.
- Добавлены безопасные HTTP-заголовки и защита от prototype-pollution JSON.
- Добавлен общий rate limit чтения/записи с поддержкой Upstash Redis.
- CORS использует CLIENT_URL/CLIENT_ORIGINS; localhost для Electron разрешён автоматически.
- Socket.IO ограничивает частые handshake, число соединений и размер пакета.
- Сообщения Socket.IO валидируют ID, тип, длину текста, reply и URL вложения.
- Backend корректно завершает работу по SIGTERM Railway.
- Next.js proxy больше не пересылает cookies и лишние заголовки, имеет таймаут 25 секунд.

## Railway

Рекомендуемые переменные:

```env
NODE_ENV=production
CLIENT_URL=https://ваш-домен.example
# Дополнительные origin через запятую:
CLIENT_ORIGINS=https://preview.example,https://second.example
API_READ_RATE_LIMIT=600
API_WRITE_RATE_LIMIT=180
```

Если CLIENT_URL и CLIENT_ORIGINS пока не заданы, сервер сохраняет совместимость с HTTPS-клиентами, но credentialed CORS не включает.

## Миграции

Новых SQL-миграций для 2.6.0 нет.

## Аудит зависимостей

- Backend production dependencies: 0 известных уязвимостей после обновления Supabase JS до 2.110.7.
- Frontend Supabase JS также обновлён до 2.110.7.
- Для устранения оставшихся предупреждений Next.js потребуется отдельный переход с Next 14 на современную major-версию. Он намеренно не смешан с backend-hardening, чтобы не сломать маршрутизацию и Electron runtime.
