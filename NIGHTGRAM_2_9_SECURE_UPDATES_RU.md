# NightGram 2.9.0 — безопасные обновления Windows

## Что добавлено

- автоматическая проверка GitHub Releases после запуска приложения;
- повторная проверка каждые 6 часов;
- ручная проверка в настройках, меню и системном трее;
- отображение версии, описания релиза и прогресса скачивания;
- скачивание установщика во внутреннюю папку NightGram;
- обязательная проверка SHA-256 перед запуском установщика;
- установка только после явного подтверждения пользователя;
- журналирование проверки, скачивания и запуска установщика;
- GitHub Actions workflow для автоматической сборки Windows Release.

## Как выпустить новую версию

1. Обновите `version` в `package.json` и `package-lock.json`.
2. Зафиксируйте изменения в ветке `main`.
3. Создайте и отправьте тег с тем же номером:

```bash
git tag v2.9.0
git push origin v2.9.0
```

4. Workflow `.github/workflows/windows-release.yml`:
   - установит зависимости;
   - выполнит TypeScript и ESLint проверки;
   - соберёт `NightGram-Setup-2.9.0-x64.exe`;
   - создаст `NightGram-Setup-2.9.0-x64.exe.sha256`;
   - опубликует оба файла в GitHub Release.

После публикации установленный NightGram увидит релиз автоматически.

## Требования к релизу

В GitHub Release обязательно должны находиться два файла с точными именами:

```text
NightGram-Setup-2.9.0-x64.exe
NightGram-Setup-2.9.0-x64.exe.sha256
```

Содержимое `.sha256`:

```text
<64-символьный SHA-256> *NightGram-Setup-2.9.0-x64.exe
```

Если контрольной суммы нет или она не совпадает, NightGram удалит скачанный файл и не позволит его запустить.

## Переопределение источника обновлений

Для тестовой сборки можно использовать переменные окружения Electron:

```env
NIGHTGRAM_UPDATE_OWNER=mi9night
NIGHTGRAM_UPDATE_REPOSITORY=NightGram
NIGHTGRAM_UPDATE_API_URL=https://api.github.com/repos/mi9night/NightGram/releases/latest
```

Обычным пользователям эти переменные не нужны.
