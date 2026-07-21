@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo NightGram 3.1 - мобильная PWA в локальной сети
echo ================================================

where node >nul 2>nul || (
  echo [ОШИБКА] Установите Node.js 20 или новее.
  pause
  exit /b 1
)

if not exist node_modules\next\package.json (
  echo Установка зависимостей...
  call npm ci
  if errorlevel 1 (
    echo [ОШИБКА] npm ci завершился с ошибкой.
    pause
    exit /b 1
  )
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip=(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object {$_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceOperationalStatus -eq 'Up'} ^| Select-Object -First 1 -ExpandProperty IPAddress); if($ip){$ip}else{'IP_КОМПЬЮТЕРА'}"`) do set NIGHTGRAM_IP=%%I

echo.
echo На телефоне в той же Wi-Fi сети откройте:
echo http://%NIGHTGRAM_IP%:3000
echo.
echo ВАЖНО: интерфейс откроется, но камера, микрофон и звонки
echo на телефоне требуют HTTPS. Для полной проверки используйте
echo опубликованный HTTPS-адрес Vercel или другой HTTPS-хостинг.
echo.
call npm run dev:mobile
