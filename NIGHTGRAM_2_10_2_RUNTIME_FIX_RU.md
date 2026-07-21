# NightGram 2.10.2 — исправление desktop-runtime

Исправлена ошибка запуска установленного приложения:

`Error: Cannot find module 'next'`

Причина: `server.js` попадал в `resources/app`, но Electron Builder мог исключить вложенную папку `node_modules` standalone-сборки.

Что изменено:

- standalone-runtime проверяется до запуска Electron Builder;
- после упаковки весь runtime принудительно копируется в `resources/app` с материализацией ссылок;
- сборка проверяет наличие `next`, `react` и `react-dom` внутри `win-unpacked`;
- повреждённый установщик блокируется и не считается готовым;
- локальный сервер получает явный `NODE_PATH`;
- диагностика теперь сообщает путь runtime и наличие Next.js.

Обновление backend и SQL-миграция не требуются.
