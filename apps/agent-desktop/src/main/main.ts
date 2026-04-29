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

function createLoginWindow() {
  if (loginWindow) {
    loginWindow.show();
    loginWindow.focus();
    return;
  }

  loginWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    title: "DijiPeople Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void loginWindow.loadFile(path.join(__dirname, "../renderer/login.html"));
  loginWindow.on("closed", () => {
    loginWindow = null;
  });
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
    async (_event, payload: { email: string; password: string }) => {
      try {
        await sessionManager.login(payload.email, payload.password);
        return { ok: true };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to sign in.";
        loginWindow?.webContents.send("agent:login-error", message);
        return { ok: false, message };
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
