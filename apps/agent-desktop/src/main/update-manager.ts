import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import type { AgentConfig } from "./types";
import { AgentLogger } from "./logger";

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * A short, log-safe description of why an update check failed.
 *
 * `electron-updater` raises plain Errors whose message carries the useful part
 * (a 404 from the feed, a DNS failure, a signature mismatch). Only the message
 * is kept: a full stack in a background log obscures the one fact that matters,
 * and the message can contain the feed URL, so it is bounded rather than
 * assumed short.
 */
function describeUpdateError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message.replace(/\s+/g, " ").trim().slice(0, 300);
  }
  return String(error ?? "unknown error").slice(0, 300);
}

export class UpdateManager {
  private timer: NodeJS.Timeout | null = null;
  private isChecking = false;
  private isShowingRequiredUpdateDialog = false;
  /** Why the last check failed, or null if it succeeded. Shown to the user in
   * the required-update dialog, which otherwise strands them (BUG-0034). */
  private lastCheckError: string | null = null;

  constructor(private readonly logger: AgentLogger) {
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
      this.logger.info("agent.update.check_success");
      this.lastCheckError = null;
    } catch (error) {
      /*
       * BUG-0034. This logged `agent.update.check_failed` with no reason
       * attached, so a feed answering 404 on every check for months looked
       * exactly like a transient network blip in the agent's own logs — the one
       * place anyone would look to find out. The reason is the entire diagnostic
       * value of the line, and it is also what turns the required-update dialog
       * below from a dead end into something an employee can act on.
       */
      this.lastCheckError = describeUpdateError(error);
      this.logger.warn(
        `agent.update.check_failed reason=${this.lastCheckError}`,
      );
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
        this.logger.info("agent.update.required_prompt_accept");
        await this.checkForUpdates();

        /*
         * BUG-0034. "Check for updates" used to return here regardless of what
         * happened. Against a feed that does not answer — which is every
         * deployment today — the check failed silently, the dialog closed, and
         * the employee was left blocked from tracking with no information and
         * no next step. The only button that did anything was Quit.
         *
         * This does not pretend the update succeeded. It says the check could
         * not reach the update service, names the reason, and tells the person
         * who can actually resolve it. That is the remediation available until
         * the feed itself exists; see BUG-0034 for why it does not yet.
         */
        if (this.lastCheckError) {
          await dialog.showMessageBox({
            type: "error",
            buttons: ["Close"],
            noLink: true,
            title: "Update check failed",
            message:
              "The DijiPeople Agent could not reach the update service, so it " +
              "cannot update itself right now.",
            detail:
              `Contact your IT administrator and quote this: ${this.lastCheckError}\n\n` +
              `Installed version: ${app.getVersion()}\n` +
              `Required version: ${policy.minimumSupportedVersion ?? "unknown"}`,
          });
        }
        return;
      }

      this.logger.warn("agent.update.required_prompt_quit");
      app.quit();
    } finally {
      this.isShowingRequiredUpdateDialog = false;
    }
  }
}
