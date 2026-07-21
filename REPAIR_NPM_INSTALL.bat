@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title NightGram - Repair npm installation

echo.
echo ======================================================
echo        NightGram npm dependency repair
echo ======================================================
echo This removes only generated npm files and recreates them
echo for the current Windows and npm version.
echo.

if exist "node_modules" (
  echo Removing node_modules...
  rmdir /s /q "node_modules"
)
if exist "package-lock.json" (
  echo Removing incompatible package-lock.json...
  del /f /q "package-lock.json"
)

call "%~dp0INSTALL_DEPENDENCIES.bat"
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" (
  echo.
  echo [ERROR] Repair failed. Review the messages above.
  pause
  exit /b %CODE%
)

echo.
echo [DONE] npm installation repaired. You can now run:
echo BUILD_PC_INSTALLER.bat
pause
exit /b 0
