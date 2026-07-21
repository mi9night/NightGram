@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Install Node.js 22+ & exit /b 1)
if not exist .env.native (echo [ERROR] Create .env.native from .env.native.example & exit /b 1)
if not exist android\app\google-services.json (echo [ERROR] Put Firebase google-services.json into android\app & exit /b 1)
if not exist android\keystore.properties (echo [ERROR] Create android\keystore.properties from the example & exit /b 1)
call npm ci || exit /b 1
call npm run native:sync || exit /b 1
cd android
call gradlew.bat bundleRelease || exit /b 1
echo.
echo AAB: android\app\build\outputs\bundle\release\app-release.aab
endlocal
