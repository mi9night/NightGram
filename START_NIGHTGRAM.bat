@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title NightGram Development Launcher

set "PORT=3000"
set "APP_URL=http://localhost:%PORT%"

echo.
echo ======================================================
echo           NightGram Development Launcher
echo ======================================================
echo Official backend is already configured.
echo.

where node >nul 2>nul || goto :NODE_MISSING
where npm >nul 2>nul || goto :NODE_MISSING
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)" >nul 2>nul
if errorlevel 1 goto :NODE_TOO_OLD

if not exist "package.json" goto :NO_PACKAGE
if not exist "node_modules\next\package.json" (
  echo [1/2] Installing dependencies...
  call "%~dp0INSTALL_DEPENDENCIES.bat"
  if errorlevel 1 goto :FAILED
) else (
  echo [OK] Dependencies are ready.
)

echo.
echo [2/2] Starting NightGram at %APP_URL%
echo Close this window or press Ctrl+C to stop the server.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process '%APP_URL%'"
call npm run dev -- -p %PORT%
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
echo [ERROR] package.json was not found next to this launcher.
pause
exit /b 1

:FAILED
echo [ERROR] Dependency installation failed.
pause
exit /b 1
