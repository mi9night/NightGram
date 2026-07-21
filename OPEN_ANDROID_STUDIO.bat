@echo off
setlocal
cd /d "%~dp0"
if not exist .env.native copy .env.native.example .env.native >nul
call npm ci || exit /b 1
call npm run native:sync || exit /b 1
call npx cap open android
endlocal
