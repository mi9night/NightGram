@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title NightGram Production Launcher

set "PORT=3000"
set "APP_URL=http://localhost:%PORT%"

echo.
echo ======================================================
echo             NightGram Production Launcher
echo ======================================================
echo.

where node >nul 2>nul || goto :NODE_MISSING
where npm >nul 2>nul || goto :NODE_MISSING
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)" >nul 2>nul
if errorlevel 1 goto :NODE_TOO_OLD

if not exist "package.json" goto :NO_PACKAGE
if not exist "node_modules\next\package.json" (
  echo [1/4] Installing dependencies...
  call "%~dp0INSTALL_DEPENDENCIES.bat"
  if errorlevel 1 goto :FAILED
) else (
  echo [1/4] Dependencies are ready.
)

echo [2/4] Checking project...
cmd /d /c node scripts\type-check.mjs
if errorlevel 1 goto :FAILED
cmd /d /c node scripts\lint.mjs
if errorlevel 1 goto :FAILED

if not exist ".next\BUILD_ID" (
  echo [3/4] Creating production build...
  call npm run build
  if errorlevel 1 goto :FAILED
) else (
  echo [3/4] Existing production build found.
)

echo [4/4] Starting NightGram at %APP_URL%
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%APP_URL%'"
call npm run start -- -p %PORT%
set "EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %EXIT_CODE%

:NODE_TOO_OLD
echo [ERROR] NightGram requires Node.js 20.9 or newer.
echo Download: https://nodejs.org/
pause
exit /b 1

:NODE_MISSING
echo [ERROR] Node.js 20.9 or newer with npm is required.
echo Download: https://nodejs.org/
pause
exit /b 1

:NO_PACKAGE
echo [ERROR] package.json is missing. Keep this file in the project root.
pause
exit /b 1

:FAILED
echo [ERROR] Installation, validation or build failed. Review the messages above.
pause
exit /b 1
