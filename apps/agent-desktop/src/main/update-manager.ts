import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import type { AgentConfig } from "./types";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class UpdateManager {
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private isShowingRequiredUpdateDialog = false;

  constructor() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
  }

  start(configProvider: () => AgentConfig): void {
    this.stop();

    const check = () => {
      try {
        const config = configProvider();

        if (config.features.autoUpdate) {
          void this.checkForUpdates();
        }
      } catch {
        // Do not crash the background agent because config is temporarily unavailable.
      }
    };

    check();

    this.timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = null;
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged || this.isChecking) {
      return;
    }

    this.isChecking = true;

    try {
      await autoUpdater.checkForUpdatesAndNotify();
    } catch {
      // Keep silent for scheduled checks. Manual update UI can be added later.
    } finally {
      this.isChecking = false;
    }
  }

  async showRequiredUpdate(
    policy: AgentConfig["agentVersionPolicy"],
  ): Promise<void> {
    if (this.isShowingRequiredUpdateDialog) {
      return;
    }

    this.isShowingRequiredUpdateDialog = true;

    try {
      const result = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Check for updates", "Quit"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title: "DijiPeople Agent update required",
        message:
          "A DijiPeople Agent update is required before tracking can continue.",
        detail:
          policy.updateMessage ??
          `Installed version ${app.getVersion()} is below the required version ${policy.minimumSupportedVersion}.`,
      });

      if (result.response === 0) {
        await this.checkForUpdates();
        return;
      }

      app.quit();
    } finally {
      this.isShowingRequiredUpdateDialog = false;
    }
  }
}