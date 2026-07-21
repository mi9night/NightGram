"use client";

import { useEffect, useState } from "react";
import {
  getLatestServerHealth,
  probeServerHealth,
  requestConnectionRecovery,
  subscribeToServerHealth,
  type ServerHealthSnapshot,
} from "@/lib/serverHealth";
import {
  AlertTriangle,
  ArchiveRestore,
  ArrowDownToLine,
  Bug,
  CheckCircle2,
  Download,
  Eraser,
  ExternalLink,
  FileDown,
  FolderOpen,
  MonitorUp,
  Power,
  RefreshCw,
  Save,
  RotateCw,
  Server,
  ShieldCheck,
  Radio,
} from "lucide-react";

type Settings = {
  launchAtLogin: boolean;
  closeToTray: boolean;
  nativeNotifications: boolean;
  autoCheckUpdates: boolean;
  updateChannel: "stable" | "beta";
};

type Diagnostics = {
  previousSessionUnclean: boolean;
  localServerRunning: boolean;
  rendererResponsive: boolean;
  startedAt: string;
  platform: string;
  arch: string;
  memoryMb: { rss: number; heapUsed: number; systemFree: number; systemTotal: number };
  paths: { logs: string; logFile: string; crashDumps: string };
};

type UpdateState = {
  channel: "stable" | "beta";
  status: "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error" | "unsupported";
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  releaseUrl: string | null;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  installerPath: string | null;
  error: string | null;
  checkedAt: string | null;
};

type BooleanSettingKey = Exclude<keyof Settings, "updateChannel">;

const rows: Array<{ key: BooleanSettingKey; title: string; description: string }> = [
  { key: "launchAtLogin", title: "Запускать вместе с Windows", description: "NightGram будет доступен сразу после входа в систему." },
  { key: "closeToTray", title: "Сворачивать в трей", description: "Кнопка закрытия скрывает окно, не отключая сообщения." },
  { key: "nativeNotifications", title: "Уведомления Windows", description: "Показывать новые события через системный центр уведомлений." },
  { key: "autoCheckUpdates", title: "Автоматически проверять обновления", description: "NightGram проверяет GitHub Releases при запуске и затем несколько раз в день." },
];

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 МБ";
  return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} МБ`;
}

function updateStatusText(update: UpdateState) {
  switch (update.status) {
    case "checking": return "Проверяем новую версию…";
    case "up-to-date": return "Установлена актуальная версия.";
    case "available": return `Доступна версия ${update.latestVersion}.`;
    case "downloading": return `Загрузка ${update.progress}% · ${formatBytes(update.downloadedBytes)} из ${formatBytes(update.totalBytes)}`;
    case "downloaded": return `Версия ${update.latestVersion} скачана и проверена.`;
    case "error": return update.error || "Не удалось проверить обновления.";
    case "unsupported": return "Автообновления доступны только в Windows-приложении.";
    default: return "Можно проверить наличие новой версии вручную.";
  }
}

export function DesktopSettingsCard() {
  const bridge = typeof window !== "undefined" ? window.nightgramDesktop : undefined;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [update, setUpdate] = useState<UpdateState | null>(null);
  const [version, setVersion] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [serverHealth, setServerHealth] = useState<ServerHealthSnapshot>(() => getLatestServerHealth());
  const [checkingServer, setCheckingServer] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void Promise.all([bridge.getSettings(), bridge.appVersion(), bridge.getDiagnostics(), bridge.getUpdateState()]).then(([next, appVersion, report, updateState]) => {
      if (!active) return;
      setSettings(next);
      setVersion(appVersion);
      setDiagnostics(report);
      setUpdate(updateState);
    });
    const unsubscribe = bridge.onUpdateState((next) => {
      if (active) setUpdate(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  useEffect(() => {
    const unsubscribe = subscribeToServerHealth(setServerHealth);
    if (getLatestServerHealth().status === "unknown") void probeServerHealth({ reason: "settings" });
    return unsubscribe;
  }, []);

  if (!bridge || !settings) return null;

  async function toggle(key: BooleanSettingKey) {
    const next = await bridge!.updateSettings({ [key]: !settings![key] });
    setSettings(next);
  }

  async function openDiagnostics() {
    const error = await bridge!.openDiagnostics();
    setActionMessage(error ? `Не удалось открыть папку: ${error}` : "Папка диагностики открыта.");
  }

  async function exportDiagnostics() {
    setExporting(true);
    try {
      const file = await bridge!.exportDiagnostics();
      setActionMessage(file ? `Отчёт сохранён: ${file}` : "Сохранение отчёта отменено.");
    } finally {
      setExporting(false);
    }
  }

  async function clearCache() {
    if (!window.confirm("Очистить временный кэш NightGram? Вход, настройки и локальные сообщения сохранятся.")) return;
    setClearingCache(true);
    setActionMessage("");
    try {
      const result = await bridge!.clearCache();
      setActionMessage(`Кэш очищен: освобождено ${formatBytes(result.freedBytes)}. Страница будет обновлена.`);
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Не удалось очистить кэш.");
      setClearingCache(false);
    }
  }

  async function checkUpdates() {
    setActionMessage("");
    const next = await bridge!.checkForUpdates();
    if (next) setUpdate(next);
  }

  async function downloadUpdate() {
    setActionMessage("");
    const next = await bridge!.downloadUpdate();
    if (next) setUpdate(next);
  }

  async function installUpdate() {
    const next = await bridge!.installUpdate();
    if (next) setUpdate(next);
  }

  async function changeUpdateChannel(channel: Settings["updateChannel"]) {
    if (channel === settings!.updateChannel) return;
    setActionMessage("");
    const nextSettings = await bridge!.updateSettings({ updateChannel: channel });
    setSettings(nextSettings);
    const nextUpdate = await bridge!.checkForUpdates();
    if (nextUpdate) setUpdate(nextUpdate);
  }

  async function checkServerConnection() {
    setCheckingServer(true);
    setActionMessage("");
    requestConnectionRecovery("settings");
    try {
      const result = await probeServerHealth({ reason: "manual", timeoutMs: 7_500 });
      if (result.status === "healthy") {
        setActionMessage(`Сервер доступен${result.latencyMs !== null ? ` · ${result.latencyMs} мс` : ""}. Переподключение сообщений запущено.`);
      } else {
        setActionMessage(result.message || "Сервер пока недоступен. NightGram продолжит использовать сохранённые данные.");
      }
    } finally {
      setCheckingServer(false);
    }
  }

  function collectSafePreferences() {
    const exactKeys = new Set([
      "ng_appearance",
      "ng_audio_output_device",
      "ng_saved_chat_pinned",
      "ng_channel_used_tags",
      "ng_integrations",
      "ng_active_store_theme",
      "ng_active_store_accent",
      "ng_active_sticker_pack",
      "ng_active_profile_background",
    ]);
    const result: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const allowed = exactKeys.has(key) || key.startsWith("ng_chat_theme:") || key.startsWith("ng_store_effect:");
      if (!allowed) continue;
      const value = localStorage.getItem(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }

  function applySafePreferences(preferences: Record<string, string>) {
    const exactKeys = new Set([
      "ng_appearance",
      "ng_audio_output_device",
      "ng_saved_chat_pinned",
      "ng_channel_used_tags",
      "ng_integrations",
      "ng_active_store_theme",
      "ng_active_store_accent",
      "ng_active_sticker_pack",
      "ng_active_profile_background",
    ]);
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      if (exactKeys.has(key) || key.startsWith("ng_chat_theme:") || key.startsWith("ng_store_effect:")) keysToRemove.push(key);
    }
    for (const key of keysToRemove) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(preferences || {})) localStorage.setItem(key, value);
  }

  async function exportPreferences() {
    try {
      const file = await bridge!.exportPreferences(collectSafePreferences());
      setActionMessage(file ? `Настройки сохранены: ${file}` : "Сохранение настроек отменено.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Не удалось сохранить настройки.");
    }
  }

  async function importPreferences() {
    try {
      const restored = await bridge!.importPreferences();
      if (!restored) {
        setActionMessage("Восстановление настроек отменено.");
        return;
      }
      applySafePreferences(restored.webPreferences);
      setSettings(restored.desktopSettings);
      setActionMessage("Настройки восстановлены. Интерфейс будет перезагружен.");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Не удалось восстановить настройки.");
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <MonitorUp size={18} className="text-neon-purple" /> NightGram для Windows
          </div>
          <p className="mt-1 text-xs text-white/40">Версия {version} · Electron {bridge.electronVersion}</p>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <button
            key={row.key}
            onClick={() => void toggle(row.key)}
            className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/5 bg-black/15 px-4 py-3 text-left transition hover:border-white/10 hover:bg-white/[0.04]"
          >
            <span>
              <span className="block text-sm font-semibold text-white/90">{row.title}</span>
              <span className="mt-0.5 block text-xs text-white/40">{row.description}</span>
            </span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings[row.key] ? "bg-neon-purple" : "bg-white/15"}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${settings[row.key] ? "left-6" : "left-1"}`} />
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-white/90"><Server size={16} className="text-neon-purple" /> Состояние сервера</div>
            <p className="mt-1 text-xs leading-5 text-white/40">NightGram отдельно проверяет API Railway и соединение сообщений. При сбое сохранённая лента и переписка остаются доступны.</p>
          </div>
          {serverHealth.status === "healthy" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200"><CheckCircle2 size={11} /> Доступен</span>
          ) : serverHealth.status === "checking" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-semibold text-violet-200"><RefreshCw size={11} className="animate-spin" /> Проверка</span>
          ) : serverHealth.status === "unknown" ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/45"><Server size={11} /> Не проверен</span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200"><AlertTriangle size={11} /> Нет связи</span>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5 text-xs">
          <span className="font-semibold text-white/70">Railway API</span>
          <span className="mt-1 block text-white/40">
            {serverHealth.status === "healthy"
              ? `Работает${serverHealth.latencyMs !== null ? ` · отклик ${serverHealth.latencyMs} мс` : ""}`
              : serverHealth.status === "checking"
                ? "Проверяем доступность…"
                : serverHealth.message || "Проверка ещё не выполнялась"}
          </span>
          {serverHealth.requestId && <span className="mt-1 block break-all text-[10px] text-white/25">Код диагностики: {serverHealth.requestId}</span>}
        </div>
        <button disabled={checkingServer} onClick={() => void checkServerConnection()} className="btn-ghost mt-3 inline-flex w-full items-center justify-center gap-2 px-3 py-2.5 text-xs disabled:opacity-50">
          <RefreshCw size={14} className={checkingServer ? "animate-spin" : ""} /> {checkingServer ? "Проверяем…" : "Проверить и переподключить"}
        </button>
      </div>

      {update && (
        <div className="mt-5 rounded-2xl border border-neon-purple/15 bg-neon-purple/[0.045] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/15 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/70"><Radio size={14} className="text-neon-purple" /> Канал обновлений</div>
            <div className="flex rounded-lg bg-white/5 p-1">
              {(["stable", "beta"] as const).map((channel) => (
                <button
                  key={channel}
                  onClick={() => void changeUpdateChannel(channel)}
                  className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${settings.updateChannel === channel ? "bg-neon-purple text-white shadow" : "text-white/45 hover:text-white/70"}`}
                >
                  {channel === "stable" ? "Stable" : "Beta"}
                </button>
              ))}
            </div>
          </div>
          <p className="mb-3 text-[11px] leading-4 text-white/35">
            {settings.updateChannel === "stable" ? "Только проверенные публичные релизы." : "Предварительные сборки для раннего тестирования; возможны ошибки."}
          </p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-white/90"><ArrowDownToLine size={16} className="text-neon-purple" /> Обновления приложения</div>
              <p className={`mt-1 text-xs leading-5 ${update.status === "error" ? "text-red-200/80" : "text-white/45"}`}>{updateStatusText(update)}</p>
            </div>
            {update.status === "downloaded" ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200"><ShieldCheck size={11} /> SHA-256 OK</span>
            ) : update.status === "available" ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-400/10 px-2 py-1 text-[10px] font-semibold text-violet-200">Новая версия</span>
            ) : null}
          </div>

          {update.status === "downloading" && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-neon-purple transition-[width] duration-300" style={{ width: `${Math.max(2, update.progress)}%` }} />
            </div>
          )}

          {update.releaseNotes && ["available", "downloading", "downloaded"].includes(update.status) && (
            <details className="mt-3 rounded-xl border border-white/5 bg-black/15 px-3 py-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-white/70">Что нового в {update.latestVersion}</summary>
              <p className="mt-2 max-h-36 overflow-auto whitespace-pre-line text-[11px] leading-5 text-white/40">{update.releaseNotes}</p>
            </details>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(update.status === "idle" || update.status === "up-to-date" || update.status === "error") && (
              <button onClick={() => void checkUpdates()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
                <RefreshCw size={14} /> Проверить обновления
              </button>
            )}
            {update.status === "checking" && (
              <button disabled className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs opacity-60">
                <RefreshCw size={14} className="animate-spin" /> Проверка…
              </button>
            )}
            {update.status === "available" && (
              <button onClick={() => void downloadUpdate()} className="btn-primary inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
                <Download size={14} /> Скачать {update.latestVersion}
              </button>
            )}
            {update.status === "downloading" && (
              <button disabled className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs opacity-60">
                <Download size={14} /> Загрузка {update.progress}%
              </button>
            )}
            {update.status === "downloaded" && (
              <button onClick={() => void installUpdate()} className="btn-primary inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
                <ShieldCheck size={14} /> Установить и перезапустить
              </button>
            )}
            {(update.installerPath || update.status === "downloaded") && (
              <button onClick={() => void bridge.openUpdateFolder()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
                <FolderOpen size={14} /> Папка обновлений
              </button>
            )}
            {update.releaseUrl && (
              <button onClick={() => window.open(update.releaseUrl!, "_blank", "noopener,noreferrer")} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
                <ExternalLink size={14} /> Страница релиза
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-white/90"><Save size={16} className="text-neon-purple" /> Резервная копия настроек</div>
            <p className="mt-1 text-xs leading-5 text-white/40">Сохраняются оформление, темы чатов, параметры Windows и выбранный канал обновлений. Аккаунты, токены и переписка не экспортируются.</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200"><ShieldCheck size={11} /> Без токенов</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button onClick={() => void exportPreferences()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
            <Save size={14} /> Сохранить настройки
          </button>
          <button onClick={() => void importPreferences()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
            <ArchiveRestore size={14} /> Восстановить из файла
          </button>
        </div>
      </div>

      {diagnostics && (
        <div className="mt-5 rounded-2xl border border-white/8 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-white/90"><Bug size={16} className="text-neon-purple" /> Локальная диагностика</div>
              <p className="mt-1 text-xs leading-5 text-white/40">Журнал хранится только на этом компьютере и не включает токены, пароли или текст переписки.</p>
            </div>
            {diagnostics.previousSessionUnclean ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-semibold text-amber-200"><AlertTriangle size={11} /> Был сбой</span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-200"><CheckCircle2 size={11} /> Норма</span>
            )}
          </div>

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5">
              <span className="flex items-center gap-1.5 font-semibold text-white/70"><Server size={13} /> Runtime</span>
              <span className="mt-1 block text-white/40">Сервер: {diagnostics.localServerRunning ? "работает" : "остановлен"} · UI: {diagnostics.rendererResponsive ? "отвечает" : "сбой"}</span>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2.5">
              <span className="font-semibold text-white/70">Память приложения</span>
              <span className="mt-1 block text-white/40">{diagnostics.memoryMb.rss} МБ · {diagnostics.platform}/{diagnostics.arch}</span>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button onClick={() => void openDiagnostics()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs">
              <FolderOpen size={14} /> Открыть журналы
            </button>
            <button disabled={exporting} onClick={() => void exportDiagnostics()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs disabled:opacity-50">
              <FileDown size={14} /> {exporting ? "Сохранение…" : "Сохранить отчёт"}
            </button>
            <button disabled={clearingCache} onClick={() => void clearCache()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs disabled:opacity-50">
              <Eraser size={14} /> {clearingCache ? "Очистка…" : "Очистить кэш"}
            </button>
          </div>
          {actionMessage && <p className="mt-2 break-all text-[11px] leading-4 text-white/40">{actionMessage}</p>}
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button onClick={() => void bridge.openDownloads()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs"><Download size={14} /> Загрузки</button>
        <button onClick={() => void bridge.restart()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs"><RotateCw size={14} /> Перезапустить</button>
        <button onClick={() => void bridge.quit()} className="btn-ghost inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs text-red-200"><Power size={14} /> Выйти</button>
      </div>
    </section>
  );
}
