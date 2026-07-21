@echo off
setlocal
cd /d "%~dp0"
if "%HOSTNAME%"=="" set HOSTNAME=0.0.0.0
if "%PORT%"=="" set PORT=3000
if "%BACKEND_API_URL%"=="" set BACKEND_API_URL=https://nightgram-production-0ceb.up.railway.app/api
if "%NEXT_PUBLIC_SOCKET_URL%"=="" set NEXT_PUBLIC_SOCKET_URL=https://nightgram-production-0ceb.up.railway.app
echo NightGram Mobile PWA 3.4.0: http://localhost:%PORT%
echo Для звонков, установки и Web Push используйте доверенный HTTPS-домен.
node server.js
pause
