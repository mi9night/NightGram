@echo off
setlocal
chcp 65001 >nul
set "HEALTH_URL=https://nightgram-production-0ceb.up.railway.app/api/health"
echo Проверка NightGram backend:
echo %HEALTH_URL%
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $r=Invoke-RestMethod -Uri '%HEALTH_URL%' -Method Get -TimeoutSec 20; $r | ConvertTo-Json -Depth 5; if (-not $r.ok) { exit 2 } } catch { Write-Host ('Ошибка: ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"
if errorlevel 1 (
  echo.
  echo Backend не прошёл проверку. Проверьте Railway Deploy Logs и переменные окружения.
  pause
  exit /b 1
)
echo.
echo [OK] Новый Railway backend доступен.
pause
