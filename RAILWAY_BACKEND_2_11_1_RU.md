# NightGram 2.11.1 — новый Railway backend

Клиент, desktop runtime, Socket.IO, health-check и Next.js proxy теперь по умолчанию используют:

- API: `https://nightgram-production-0ceb.up.railway.app/api`
- Socket.IO: `https://nightgram-production-0ceb.up.railway.app`
- Health-check: `https://nightgram-production-0ceb.up.railway.app/api/health`

`.env.local` не требуется. Переменные окружения по-прежнему могут переопределить адрес для разработки.

## Переменные нового Railway проекта

Поскольку Supabase и секреты остаются прежними, перенесите значения переменных из старого Railway проекта в новый без изменений. `PORT` вручную задавать не нужно.

После развёртывания проверьте `/api/health`, вход и обмен сообщениями между двумя аккаунтами.
