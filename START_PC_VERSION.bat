@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title NightGram PC

where node >nul 2>nul || goto :NODE_MISSING
where npm >nul 2>nul || goto :NODE_MISSING
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)" >nul 2>nul
if errorlevel 1 goto :NODE_TOO_OLD

if not exist "node_modules\electron\package.json" (
  call "%~dp0INSTALL_DEPENDENCIES.bat"
  if errorlevel 1 goto :FAILED
)

if not exist "desktop-runtime\app\server.js" (
  echo Preparing NightGram PC for the first launch...
  cmd /d /c node scripts\type-check.mjs
  if errorlevel 1 goto :FAILED
  cmd /d /c node scripts\lint.mjs
  if errorlevel 1 goto :FAILED
  call npm run desktop:build
  if errorlevel 1 goto :FAILED
)

start "NightGram Desktop" /B cmd /c "npm run desktop:run"
exit /b 0

:NODE_TOO_OLD
echo NightGram requires Node.js 20.9 or newer.
echo Download: https://nodejs.org/
pause
exit /b 1

:NODE_MISSING
echo Node.js 20.9 or newer is required only for this developer package.
echo The finished NightGram Setup.exe will not require Node.js.
echo Download: https://nodejs.org/
pause
exit /b 1

:FAILED
echo NightGram PC could not be started. Review the errors above.
pause
exit /b 2
