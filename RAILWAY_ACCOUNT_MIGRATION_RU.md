# Перенос NightGram на другой Railway-аккаунт

## Что нужно для обновления клиента

Для подготовки новой сборки NightGram достаточно сообщить только новый публичный Railway-домен, например:

```text
https://new-nightgram-production.up.railway.app
```

Секретные ключи и пароли отправлять в чат не нужно.

## Что переносится со старого Railway

Если NightGram продолжает использовать тот же Supabase-проект, перенесите значения переменных без изменений:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `ACCESS_TOKEN_TTL`
- `REFRESH_TOKEN_TTL`
- `CLIENT_URL`
- `CLIENT_ORIGINS`
- `API_READ_RATE_LIMIT`
- `API_WRITE_RATE_LIMIT`
- все используемые `STRIPE_*`
- `APP_WEBHOOK_RETURN_URL`
- `DONATION_WEBHOOK_SECRET`
- `DONATIONALERTS_WEBHOOK_SECRET`
- `DONATEX_WEBHOOK_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- используемые OAuth client ID

`PORT` вручную обычно задавать не требуется: Railway передаёт его приложению автоматически.

## Почему JWT-секреты нужно сохранить

Если поменять `JWT_SECRET` или `JWT_REFRESH_SECRET`, уже выпущенные токены перестанут работать и пользователям придётся войти заново. Данные аккаунтов и сообщения при этом не удалятся.

## Если меняется и Supabase

Это отдельный перенос базы и Storage. Нужно экспортировать таблицы, файлы, политики RLS и выполнить все миграции NightGram в новом проекте. Одной замены Railway-переменных недостаточно.

## Рекомендуемый вариант на будущее

Подключите стабильный собственный домен, например `api.nightgram.app`, к Railway. Тогда при следующей смене Railway-аккаунта будет достаточно перенаправить домен, а Windows-клиенты не придётся пересобирать.
