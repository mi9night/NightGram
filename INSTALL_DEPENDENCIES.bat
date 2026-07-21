@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul || goto :NODE_MISSING
where npm >nul 2>nul || goto :NODE_MISSING
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)" >nul 2>nul
if errorlevel 1 goto :NODE_TOO_OLD

rem Force the official public registry. This overrides stale global npm settings.
set "npm_config_registry=https://registry.npmjs.org/"
set "npm_config_fetch_retries=5"
set "npm_config_fetch_retry_factor=2"
set "npm_config_fetch_retry_mintimeout=20000"
set "npm_config_fetch_retry_maxtimeout=120000"
set "npm_config_fetch_timeout=300000"
set "npm_config_audit=false"
set "npm_config_fund=false"

call npm config delete proxy --location=project >nul 2>nul
call npm config delete https-proxy --location=project >nul 2>nul

echo Installing NightGram dependencies from:
echo https://registry.npmjs.org/
echo This can download several hundred megabytes on the first launch.
echo.

rem Do not use npm ci here. Recent npm versions can reject lock files created on
rem another OS when platform-specific optional packages are absent. npm install
rem repairs or creates the lock file for the current Windows/npm combination.
call npm install --include=optional --registry=https://registry.npmjs.org/ --prefer-online --no-audit --no-fund
if not errorlevel 1 goto :SUCCESS

echo.
echo [WARN] Installation failed. Cleaning only generated dependency files...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "package-lock.json" del /f /q "package-lock.json"
call npm cache verify

echo.
echo [INFO] Creating a fresh Windows-compatible dependency lock...
call npm install --include=optional --registry=https://registry.npmjs.org/ --prefer-online --no-audit --no-fund
if not errorlevel 1 goto :SUCCESS

echo.
echo [ERROR] Dependencies could not be installed from registry.npmjs.org.
echo Check your internet connection, VPN, firewall and antivirus.
exit /b 1

:SUCCESS
echo.
echo [OK] Dependencies are installed and package-lock.json is synchronized.
exit /b 0

:NODE_TOO_OLD
echo [ERROR] NightGram requires Node.js 20.9 or newer.
echo Download: https://nodejs.org/
exit /b 10

:NODE_MISSING
echo [ERROR] Node.js and npm were not found.
echo Download: https://nodejs.org/
exit /b 10
