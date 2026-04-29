import { app, Menu, nativeImage, Tray } from "electron";
import { ConfigManager } from "./config-manager";
import { SessionManager } from "./session-manager";

export function createAgentTray(params: {
  sessionManager: SessionManager;
  configManager: ConfigManager;
  onShowLogin: () => void;
  onCheckUpdates: () => void;
}) {
  const tray = new Tray(nativeImage.createEmpty());

  function update() {
    const userLabel = params.sessionManager.user?.fullName ?? "Not logged in";
    tray.setToolTip(`DijiPeople Agent - ${params.sessionManager.status}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Logged in user: ${userLabel}`, enabled: false },
        {
          label: `Current status: ${params.sessionManager.status}`,
          enabled: false,
        },
        {
          label: `Connection: ${params.sessionManager.connectionStatus}`,
          enabled: false,
        },
        { label: `Version: ${app.getVersion()}`, enabled: false },
        {
          label: `Last config sync: ${formatDate(params.configManager.lastConfigSync)}`,
          enabled: false,
        },
        {
          label: `Last heartbeat: ${formatDate(params.sessionManager.lastHeartbeatSync)}`,
          enabled: false,
        },
        { type: "separator" },
        { label: "Check for updates", click: params.onCheckUpdates },
        {
          label: params.sessionManager.user ? "Logout" : "Login",
          click: () =>
            params.sessionManager.user
              ? void params.sessionManager.logout()
              : params.onShowLogin(),
        },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
  }

  params.sessionManager.on("changed", update);
  update();
  return tray;
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString() : "Never";
}
