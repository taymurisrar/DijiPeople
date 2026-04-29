import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import type { AgentConfig } from "./types";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class UpdateManager {
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  }

  start(configProvider: () => AgentConfig) {
    this.stop();
    const check = () => {
      const config = configProvider();
      if (config.features.autoUpdate) {
        void this.checkForUpdates();
      }
    };

    check();
    this.timer = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async checkForUpdates() {
    if (!app.isPackaged) return;
    await autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
  }

  async showRequiredUpdate(policy: AgentConfig["agentVersionPolicy"]) {
    await dialog.showMessageBox({
      type: "warning",
      buttons: ["Check for updates"],
      defaultId: 0,
      title: "DijiPeople Agent update required",
      message:
        "A DijiPeople Agent update is required before tracking can continue.",
      detail:
        policy.updateMessage ??
        `Installed version ${app.getVersion()} is below the required version ${policy.minimumSupportedVersion}.`,
    });
    await this.checkForUpdates();
  }
}
