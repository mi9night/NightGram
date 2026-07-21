@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title NightGram - Windows Installer Builder

color 0D
echo.
echo ======================================================
echo          NightGram Windows Installer Builder
echo ======================================================
echo Official backend is already configured.
echo No .env.local file is required.
echo.

where node >nul 2>nul || goto :NODE_MISSING
where npm >nul 2>nul || goto :NODE_MISSING
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)" >nul 2>nul
if errorlevel 1 goto :NODE_TOO_OLD

for /f "tokens=*" %%v in ('node --version') do echo [OK] Node.js %%v
for /f "tokens=*" %%v in ('npm --version') do echo [OK] npm %%v
for /f "tokens=*" %%v in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%v"
echo [OK] NightGram !APP_VERSION!

echo.
echo [1/6] Installing dependencies...
call "%~dp0INSTALL_DEPENDENCIES.bat"
if errorlevel 1 goto :DEPENDENCY_FAILED

echo.
echo [2/6] Checking installer options, TypeScript and ESLint...
cmd /d /c node scripts\verify-installer-config.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-installer-preferences.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-cache-maintenance.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-connection-recovery.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-server-health.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-message-actions-media.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-pinned-messages.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-group-management.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-global-search.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-drafts-scheduling.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-scheduled-worker.cjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-chat-organization.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-polls-mentions.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-polls-mentions.cjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-channel-moderation.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-auth-sessions.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-auth-sessions.cjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-privacy-safety.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-privacy-rules.cjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-two-factor-auth.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-two-factor-utils.cjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-account-recovery.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\verify-notification-preferences.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\test-notification-preferences.cjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\type-check.mjs
if errorlevel 1 goto :BUILD_FAILED
cmd /d /c node scripts\lint.mjs
if errorlevel 1 goto :BUILD_FAILED

echo.
echo [3/6] Cleaning old build and preparing desktop runtime...
if exist ".next" rmdir /s /q ".next"
if exist "desktop-runtime" rmdir /s /q "desktop-runtime"
if exist "release" rmdir /s /q "release"
call npm run desktop:build
if errorlevel 1 goto :BUILD_FAILED

echo.
echo [4/6] Creating NightGram Setup.exe...
call npx electron-builder --win nsis
if errorlevel 1 goto :INSTALLER_FAILED

echo.
echo [5/6] Verifying packaged Next.js runtime...
if not exist "release\win-unpacked\resources\app\server.js" goto :RUNTIME_FAILED
if not exist "release\win-unpacked\resources\app\node_modules\next\package.json" goto :RUNTIME_FAILED
if not exist "release\win-unpacked\resources\app\node_modules\react\package.json" goto :RUNTIME_FAILED
if not exist "release\win-unpacked\resources\app\node_modules\react-dom\package.json" goto :RUNTIME_FAILED
echo [OK] Standalone runtime contains Next.js, React and React DOM.

echo.
echo [6/6] Creating SHA-256 checksum...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Get-Item ('release\NightGram-Setup-' + $env:APP_VERSION + '-x64.exe'); $h=(Get-FileHash -Algorithm SHA256 $f.FullName).Hash.ToLowerInvariant(); Set-Content -Path ($f.FullName + '.sha256') -Value ($h + ' *' + $f.Name) -Encoding ascii -NoNewline; Write-Host ('[OK] SHA-256 ' + $h)"
if errorlevel 1 goto :CHECKSUM_FAILED

echo.
echo ======================================================
echo [DONE] Installer is ready.
echo Folder: %CD%\release
echo File: NightGram-Setup-!APP_VERSION!-x64.exe
echo Checksum: NightGram-Setup-!APP_VERSION!-x64.exe.sha256
echo ======================================================
echo.
if exist "release" start "" explorer "%CD%\release"
pause
exit /b 0

:NODE_TOO_OLD
echo [ERROR] NightGram requires Node.js 20.9 or newer to build.
echo Install the current Node.js LTS from https://nodejs.org/
pause
exit /b 1

:NODE_MISSING
echo [ERROR] Node.js 20.9 or newer with npm is required to BUILD the installer.
echo End users will not need Node.js after Setup.exe is built.
echo Download: https://nodejs.org/
pause
exit /b 1

:DEPENDENCY_FAILED
echo [ERROR] Could not install npm dependencies.
pause
exit /b 2

:BUILD_FAILED
echo [ERROR] NightGram build failed. Review the errors above.
pause
exit /b 3

:INSTALLER_FAILED
echo [ERROR] Electron Builder could not create Setup.exe.
echo Check free disk space and Windows Defender permissions.
pause
exit /b 4

:RUNTIME_FAILED
echo [ERROR] Setup.exe was blocked because the packaged runtime is incomplete.
echo Missing: release\win-unpacked\resources\app\node_modules\next\package.json
echo Do not distribute this installer. Run REPAIR_NPM_INSTALL.bat and build again.
pause
exit /b 6

:CHECKSUM_FAILED
echo [ERROR] Installer was created, but SHA-256 checksum generation failed.
pause
exit /b 5
