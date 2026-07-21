export {};

type DesktopSettings = {
  launchAtLogin: boolean;
  closeToTray: boolean;
  nativeNotifications: boolean;
  autoCheckUpdates: boolean;
  updateChannel: "stable" | "beta";
};

type DesktopDiagnostics = {
  appVersion: string;
  appName: string;
  packaged: boolean;
  platform: string;
  arch: string;
  osRelease: string;
  osType: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  startedAt: string;
  previousSessionUnclean: boolean;
  localServerRunning: boolean;
  rendererResponsive: boolean;
  memoryMb: {
    rss: number;
    heapUsed: number;
    systemFree: number;
    systemTotal: number;
  };
  paths: {
    logs: string;
    logFile: string;
    crashDumps: string;
    preferencesBackups: string;
  };
  settings: DesktopSettings;
};


type DesktopUpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "downloaded" | "error" | "unsupported";

type DesktopUpdateState = {
  channel: "stable" | "beta";
  status: DesktopUpdateStatus;
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


type DesktopPreferencesImportResult = {
  filePath: string;
  desktopSettings: DesktopSettings;
  webPreferences: Record<string, string>;
  requiresReload: boolean;
};

type DesktopErrorReport = {
  level?: "error" | "warn";
  scope?: string;
  name?: string;
  message: string;
  stack?: string;
  route?: string;
  context?: Record<string, string | number | boolean | null | undefined>;
};

declare global {
  interface Window {
    nightgramDesktop?: {
      platform: string;
      isDesktop: true;
      electronVersion: string;
      appVersion(): Promise<string>;
      getSettings(): Promise<DesktopSettings>;
      updateSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
      showNotification(payload: { title: string; body?: string; silent?: boolean }): Promise<boolean>;
      reportError(payload: DesktopErrorReport): Promise<boolean>;
      getDiagnostics(): Promise<DesktopDiagnostics>;
      openDiagnostics(): Promise<string>;
      exportDiagnostics(): Promise<string | null>;
      exportPreferences(webPreferences: Record<string, string>): Promise<string | null>;
      importPreferences(): Promise<DesktopPreferencesImportResult | null>;
      getUpdateState(): Promise<DesktopUpdateState | null>;
      checkForUpdates(): Promise<DesktopUpdateState | null>;
      downloadUpdate(): Promise<DesktopUpdateState | null>;
      installUpdate(): Promise<DesktopUpdateState | null>;
      openUpdateFolder(): Promise<string | null>;
      onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
      chooseDisplaySource(): Promise<{ id: string; name: string } | null>;
      openDownloads(): Promise<string>;
      clearCache(): Promise<{ beforeBytes: number; afterBytes: number; freedBytes: number; preserved: string[] }>;
      restart(): Promise<void>;
      quit(): Promise<void>;
    };
  }
}
