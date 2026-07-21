@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Install Node.js 22+ & exit /b 1)
if not exist .env.native (
  echo [ERROR] Create .env.native from .env.native.example and set your real HTTPS domain.
  exit /b 1
)
call npm ci || exit /b 1
call npm run native:sync || exit /b 1
cd android
call gradlew.bat assembleDebug || exit /b 1
echo.
echo APK: android\app\build\outputs\apk\debug\app-debug.apk
endlocal
