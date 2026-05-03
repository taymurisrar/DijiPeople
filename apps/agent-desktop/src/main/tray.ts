import { app, Menu, nativeImage, Tray } from "electron";
import { ConfigManager } from "./config-manager";
import { SessionManager } from "./session-manager";

type CreateAgentTrayParams = {
  sessionManager: SessionManager;
  configManager: ConfigManager;
  onShowLogin: () => void;
  onCheckUpdates: () => void;
};

export function createAgentTray(params: CreateAgentTrayParams): Tray {
  const tray = new Tray(nativeImage.createEmpty());

  tray.setTitle("DP");
  tray.setToolTip("DijiPeople Agent");

  const update = () => {
    const userLabel = params.sessionManager.user?.fullName?.trim()
      ? params.sessionManager.user.fullName
      : "Not logged in";

    const status = params.sessionManager.status;
    const connection = resolveConnectionLabel(params.sessionManager);

    tray.setToolTip(`DijiPeople Agent • ${status} • ${connection}`);

    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: "DijiPeople Agent",
          enabled: false,
        },
        {
          label: `Signed in as: ${userLabel}`,
          enabled: false,
        },
        {
          label: `Activity status: ${formatStatusLabel(status)}`,
          enabled: false,
        },
        {
          label: `Connection: ${connection}`,
          enabled: false,
        },
        {
          label: `Version: ${app.getVersion()}`,
          enabled: false,
        },
        {
          label: `Last config sync: ${formatDate(
            params.configManager.lastConfigSync,
          )}`,
          enabled: false,
        },
        {
          label: `Last heartbeat: ${formatHeartbeatLabel(
            params.sessionManager,
          )}`,
          enabled: false,
        },
        { type: "separator" },
        {
          label: "Open sign-in window",
          visible: !params.sessionManager.user,
          click: params.onShowLogin,
        },
        {
          label: "Check for updates",
          click: () => {
            params.onCheckUpdates();
          },
        },
        {
          label: "Sync heartbeat now",
          enabled: Boolean(
            params.sessionManager.user &&
              params.sessionManager.sessionId &&
              params.sessionManager.deviceId,
          ),
          click: () => {
            void params.sessionManager.syncHeartbeat();
          },
        },
        { type: "separator" },
        {
          label: "Logout",
          visible: Boolean(params.sessionManager.user),
          click: () => {
            void params.sessionManager.logout();
          },
        },
        {
          label: "Quit DijiPeople Agent",
          click: () => {
            app.quit();
          },
        },
      ]),
    );
  };

  const safeUpdate = () => {
    try {
      update();
    } catch {
      // Tray should never crash the background agent.
    }
  };

  params.sessionManager.on("changed", safeUpdate);
  params.sessionManager.on("authenticated", safeUpdate);
  params.sessionManager.on("login-required", safeUpdate);
  params.sessionManager.on("session-error", safeUpdate);
  params.sessionManager.on("update-required", safeUpdate);

  tray.on("click", () => {
    if (!params.sessionManager.user) {
      params.onShowLogin();
      return;
    }

    safeUpdate();
    tray.popUpContextMenu();
  });

  tray.on("right-click", () => {
    safeUpdate();
    tray.popUpContextMenu();
  });

  safeUpdate();

  return tray;
}

function resolveConnectionLabel(sessionManager: SessionManager): string {
  if (!sessionManager.user) {
    return "Signed out";
  }

  if (!sessionManager.sessionId || !sessionManager.deviceId) {
    return "Starting";
  }

  if (sessionManager.connectionStatus === "ONLINE") {
    return "Online";
  }

  if (!sessionManager.lastHeartbeatSync) {
    return "Waiting for first sync";
  }

  return "Offline";
}

function formatHeartbeatLabel(sessionManager: SessionManager): string {
  if (!sessionManager.user) {
    return "Not signed in";
  }

  if (!sessionManager.sessionId || !sessionManager.deviceId) {
    return "Session is starting";
  }

  return formatDate(sessionManager.lastHeartbeatSync);
}

function formatStatusLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "Never";

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString();
}