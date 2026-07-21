NIGHTGRAM 2.10.6 — WINDOWS
=======================

Официальный сервер уже встроен:
API: https://nightgram-production-0ceb.up.railway.app/api
Socket: https://nightgram-production-0ceb.up.railway.app

Обычному пользователю НЕ нужны:
- .env.local
- настройка адресов сервера
- Node.js после установки готового Setup.exe
- npm и батники после установки

Сборка установщика разработчиком:
1. Установить Node.js LTS.
2. Запустить BUILD_PC_INSTALLER.bat.
3. Забрать release\NightGram-Setup-2.10.6-x64.exe.
4. Этот Setup.exe можно отправлять другим пользователям.

Для тестового backend можно необязательно создать .env.local:
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
