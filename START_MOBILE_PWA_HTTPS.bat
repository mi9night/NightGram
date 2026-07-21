@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul || (
  echo [ОШИБКА] Установите Node.js 20 или новее.
  pause
  exit /b 1
)

if not exist node_modules\next\package.json call npm ci

echo Запуск экспериментального локального HTTPS Next.js...
echo Сертификат должен быть доверенным на телефоне, иначе камера и микрофон могут не работать.
call npm run dev:mobile:https
