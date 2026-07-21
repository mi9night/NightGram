# NightGram 2.7.0 — Next.js 16 LTS

## Платформа

- Next.js обновлён с неподдерживаемой ветки 14 до Next.js 16.2.10 Active LTS.
- React и React DOM обновлены до 19.2.7.
- Framer Motion обновлён до версии с официальной поддержкой React 19.
- Zustand обновлён до версии 5 с поддержкой React 19.
- Минимальная версия Node.js для сборки: 20.9.

## Совместимость Next.js 16

- `middleware.ts` перенесён на новый формат `proxy.ts`.
- Динамические Client Component страницы используют `useParams`.
- Route Handler proxy использует асинхронные `params`.
- `next lint` заменён на ESLint CLI и Flat Config.
- Production-сборка использует Webpack-режим для проверенного Electron standalone.
- Output tracing ограничен корнем проекта и двумя worker-процессами.

## Безопасность и сборка

- PostCSS принудительно обновлён до 8.5.10, включая зависимость внутри Next.js.
- `npm audit --omit=dev`: 0 известных уязвимостей.
- Добавлены отдельные скрипты TypeScript/ESLint с таймаутами и явными кодами выхода.
- Windows-лаунчеры проверяют Node.js 20.9+ и используют воспроизводимый `npm install --include=optional`.
- Railway backend остаётся встроенным и `.env.local` не требуется.
