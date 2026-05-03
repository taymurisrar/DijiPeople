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

let loginWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const apiClient = new ApiClient();
const configManager = new ConfigManager(apiClient);
const sessionManager = new SessionManager(
  apiClient,
  new SecureStore(),
  configManager,
  new ActivityTracker(),
  new OfflineQueue(),
);
const updateManager = new UpdateManager();

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
loginWindow.webContents.openDevTools({ mode: "detach" });
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
  code: "UNKNOWN_ERROR",
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
  });

  sessionManager.on("update-required", (policy) => {
    void updateManager.showRequiredUpdate(policy);
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
}

app.on("ready", async () => {
  app.setLoginItemSettings({ openAtLogin: true });

  wireEvents();

  tray = createAgentTray({
    sessionManager,
    configManager,
    onShowLogin: createLoginWindow,
    onCheckUpdates: () => void updateManager.checkForUpdates(),
  });

  updateManager.start(() => configManager.current);

  // TEMP: clear stale desktop agent token
  await sessionManager.logout(false);

  const restored = await sessionManager.restore();

  if (!restored) {
    createLoginWindow();
  }
});

app.on("before-quit", () => {
  void sessionManager.logout(false);
  updateManager.stop();
});

app.on("window-all-closed", () => {
  // Keep the background agent alive from the tray when the login window closes.
});