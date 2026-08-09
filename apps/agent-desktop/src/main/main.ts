import { app, BrowserWindow, ipcMain, type Tray } from "electron";
import path from "node:path";
import { ActivityTracker } from "./activity-tracker";
import { ApiClient } from "./api-client";
import { ConfigManager } from "./config-manager";
import { OfflineQueue } from "./offline-queue";
import { SecureStore } from "./secure-store";
import { SessionManager } from "./session-manager";
import { createAgentTray } from "./tray";
import { UpdateManager } from "./update-manager";
import { AgentLogger } from "./logger";
import { resolveAgentAsset } from "./assets";
import {
  captureDesktopLocation,
  probeDesktopLocationPermission,
} from "./location-capture";
import type { AgentLocationRequest, AgentLocationResult } from "./types";

let loginWindow: BrowserWindow | null = null;
let permissionsWindow: BrowserWindow | null = null;
let locationRequestWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let permissionPromptSessionId: string | null = null;
let currentLocationRequest: AgentLocationRequest | null = null;

const apiClient = new ApiClient();
const configManager = new ConfigManager(apiClient);
const logger = new AgentLogger();
const sessionManager = new SessionManager(
  apiClient,
  new SecureStore(),
  configManager,
  new ActivityTracker(),
  new OfflineQueue(),
  logger,
);
const updateManager = new UpdateManager(logger);

type LoginPayload = {
  email: string;
  password: string;
};

type LoginResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "VALIDATION_ERROR"
        | "INVALID_CREDENTIALS"
        | "ACCOUNT_INACTIVE"
        | "NETWORK_ERROR"
        | "SERVER_ERROR"
        | "UNKNOWN_ERROR";
      message: string;
      fieldErrors?: Partial<Record<keyof LoginPayload, string>>;
    };

function resolveWindowIcon() {
  return resolveAgentAsset("app-icon-512x512.png") ?? undefined;
}

function createLoginWindow() {
  if (loginWindow) {
    loginWindow.show();
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 460,
    height: 580,
    minWidth: 460,
    minHeight: 580,
    resizable: false,
    title: "DijiPeople Agent",
    show: false,
    icon: resolveWindowIcon(),
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  loginWindow.once("ready-to-show", () => {
    loginWindow?.show();
    loginWindow?.focus();
  });

  void loginWindow.loadFile(path.join(__dirname, "../renderer/login.html"));
  loginWindow.on("closed", () => {
    loginWindow = null;
  });
}

function validateLoginPayload(payload: LoginPayload): LoginResult | null {
  const email = payload.email?.trim();
  const password = payload.password ?? "";

  const fieldErrors: Partial<Record<keyof LoginPayload, string>> = {};

  if (!email) {
    fieldErrors.email = "Work email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid work email address.";
  }

  if (!password) {
    fieldErrors.password = "Password is required.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  return null;
}

function normalizeLoginError(error: unknown): LoginResult {
  const rawMessage =
    error instanceof Error ? error.message : "Unable to sign in.";

  const message = rawMessage.toLowerCase();

  if (
    message.includes("invalid") ||
    message.includes("incorrect") ||
    message.includes("credentials") ||
    message.includes("unauthorized") ||
    message.includes("password")
  ) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: rawMessage || "Unable to sign in. Please try again.",
    };
  }

  if (
    message.includes("not active") ||
    message.includes("inactive") ||
    message.includes("disabled") ||
    message.includes("blocked")
  ) {
    return {
      ok: false,
      code: "ACCOUNT_INACTIVE",
      message:
        "This account is not active. Contact your administrator to restore access.",
    };
  }

  if (
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("timeout")
  ) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message:
        "Unable to reach the DijiPeople server. Check your internet connection or server URL.",
    };
  }

  if (
    message.includes("500") ||
    message.includes("internal server") ||
    message.includes("server error")
  ) {
    return {
      ok: false,
      code: "SERVER_ERROR",
      message:
        "The server could not complete the sign-in request. Please try again.",
    };
  }

  return {
    ok: false,
    code: "UNKNOWN_ERROR",
    message: rawMessage || "Unable to sign in. Please try again.",
  };
}

function wireEvents() {
  sessionManager.on("login-required", createLoginWindow);

  sessionManager.on("authenticated", () => {
    loginWindow?.close();
    maybeShowDevicePermissionPrompt();
  });

  sessionManager.on("update-required", (policy) => {
    void updateManager.showRequiredUpdate(policy);
  });

  sessionManager.on("location-request", (request) => {
    createLocationRequestWindow(request as AgentLocationRequest);
  });

  ipcMain.handle(
    "agent:login",
    async (_event, payload: LoginPayload): Promise<LoginResult> => {
      const validationError = validateLoginPayload(payload);

      if (validationError) {
        return validationError;
      }

      try {
        await sessionManager.login(
          payload.email.trim().toLowerCase(),
          payload.password,
        );

        return { ok: true };
      } catch (error) {
        const result = normalizeLoginError(error);

        loginWindow?.webContents.send("agent:login-error", result);

        return result;
      }
    },
  );

  ipcMain.handle("agent:resume-session", async (): Promise<LoginResult> => {
    try {
      await sessionManager.resumeSavedSession();

      return { ok: true };
    } catch (error) {
      const result = normalizeLoginError(error);

      loginWindow?.webContents.send("agent:login-error", result);

      return result;
    }
  });

  ipcMain.handle(
    "agent:update-device-permissions",
    async (_event, permissions) => {
      try {
        await sessionManager.updateDevicePermissions(permissions);

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Unable to save device permission status.",
        };
      }
    },
  );

  ipcMain.handle("agent:get-device-permission-config", () => {
    const features = configManager.current.features;

    return {
      cameraAccess: Boolean(features.cameraAccess),
      microphoneAccess: Boolean(features.microphoneAccess),
      locationAccess: Boolean(features.locationAccess),
    };
  });

  ipcMain.handle("agent:get-location-request", () => currentLocationRequest);

  ipcMain.handle("agent:capture-desktop-location", async () => {
    if (!configManager.current.features.locationAccess) {
      return {
        ok: false,
        reason: "unavailable",
        message: "Location access is disabled in desktop agent settings.",
      };
    }

    return captureDesktopLocation();
  });

  ipcMain.handle("agent:probe-location-permission", async () => {
    if (!configManager.current.features.locationAccess) {
      return "UNAVAILABLE";
    }

    return probeDesktopLocationPermission();
  });

  ipcMain.handle(
    "agent:submit-location-result",
    async (_event, result: AgentLocationResult) => {
      try {
        await sessionManager.completeLocationRequest(result);

        if (currentLocationRequest?.id === result.requestId) {
          currentLocationRequest = null;
        }

        locationRequestWindow?.close();

        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Unable to submit location result.",
        };
      }
    },
  );
}

function hasEnabledDevicePermissions() {
  const features = configManager.current.features;

  return Boolean(
    features.cameraAccess || features.microphoneAccess || features.locationAccess,
  );
}

function maybeShowDevicePermissionPrompt() {
  if (!sessionManager.sessionId || !sessionManager.deviceId) return;
  if (!hasEnabledDevicePermissions()) return;
  if (permissionPromptSessionId === sessionManager.sessionId) return;

  permissionPromptSessionId = sessionManager.sessionId;
  setTimeout(() => {
    createPermissionsWindow();
  }, 1_000);
}

function isDevicePermissionAllowed(permission: string): boolean {
  const features = configManager.current.features;

  if (permission === "media") {
    return Boolean(features.cameraAccess || features.microphoneAccess);
  }

  if (permission === "geolocation") {
    return Boolean(features.locationAccess);
  }

  return false;
}

// Without a check handler Electron answers navigator.permissions.query() with
// "denied", which made the renderer give up before it ever tried to capture.
function applyDevicePermissionHandlers(window: BrowserWindow) {
  const { session } = window.webContents;

  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(isDevicePermissionAllowed(permission));
  });

  session.setPermissionCheckHandler((_webContents, permission) =>
    isDevicePermissionAllowed(permission),
  );
}

function createPermissionsWindow() {
  if (permissionsWindow) {
    permissionsWindow.show();
    permissionsWindow.focus();
    return;
  }

  permissionsWindow = new BrowserWindow({
    width: 560,
    height: 560,
    minWidth: 520,
    minHeight: 520,
    title: "DijiPeople Agent Permissions",
    show: false,
    icon: resolveWindowIcon(),
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  applyDevicePermissionHandlers(permissionsWindow);

  permissionsWindow.once("ready-to-show", () => {
    permissionsWindow?.show();
    permissionsWindow?.focus();
  });

  void permissionsWindow.loadFile(
    path.join(__dirname, "../renderer/device-permissions.html"),
  );

  permissionsWindow.on("closed", () => {
    permissionsWindow = null;
  });
}

function createLocationRequestWindow(request: AgentLocationRequest) {
  if (!configManager.current.features.locationAccess) return;

  currentLocationRequest = request;

  if (locationRequestWindow) {
    locationRequestWindow.show();
    locationRequestWindow.focus();
    return;
  }

  locationRequestWindow = new BrowserWindow({
    width: 520,
    height: 420,
    minWidth: 480,
    minHeight: 380,
    title: "DijiPeople Location Request",
    autoHideMenuBar: true,
    show: false,
    icon: resolveWindowIcon(),
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  locationRequestWindow.setMenu(null);

  applyDevicePermissionHandlers(locationRequestWindow);

  locationRequestWindow.once("ready-to-show", () => {
    locationRequestWindow?.show();
    locationRequestWindow?.focus();
  });

  void locationRequestWindow.loadFile(
    path.join(__dirname, "../renderer/location-request.html"),
  );

  locationRequestWindow.on("closed", () => {
    locationRequestWindow = null;

    if (currentLocationRequest) {
      sessionManager.releaseLocationRequest(currentLocationRequest.id);
      currentLocationRequest = null;
    }
  });
}

// The agent auto-starts at login and lives in the tray, so a second copy would
// register its own work session and double every heartbeat. Hand focus to the
// instance that is already running instead.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  const existingWindow =
    locationRequestWindow ?? permissionsWindow ?? loginWindow;

  if (existingWindow) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }

    existingWindow.show();
    existingWindow.focus();
    return;
  }

  if (!sessionManager.user) {
    createLoginWindow();
  }
});

app.on("ready", async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  app.setLoginItemSettings({ openAtLogin: true });

  wireEvents();

  tray = createAgentTray({
    sessionManager,
    configManager,
    onShowLogin: createLoginWindow,
    onShowDevicePermissions: createPermissionsWindow,
    onCheckUpdates: () => void updateManager.checkForUpdates(),
  });

  updateManager.start(() => configManager.current);
  logger.info("agent.startup", { version: app.getVersion() });

  const restored = await sessionManager.restore();

  if (!restored) {
    createLoginWindow();
  } else {
    maybeShowDevicePermissionPrompt();
  }
});

app.on("before-quit", () => {
  void sessionManager.stopForAppQuit();
  updateManager.stop();
});

app.on("window-all-closed", () => {
  // Keep the background agent alive from the tray when the login window closes.
});
