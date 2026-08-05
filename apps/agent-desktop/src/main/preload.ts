import { contextBridge, ipcRenderer } from "electron";

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

type AgentDevicePermissionStatus =
  | "GRANTED"
  | "DENIED"
  | "PROMPT"
  | "RESTRICTED"
  | "UNAVAILABLE"
  | "UNKNOWN";

type AgentDevicePermissions = {
  cameraPermission: AgentDevicePermissionStatus;
  microphonePermission: AgentDevicePermissionStatus;
  locationPermission: AgentDevicePermissionStatus;
};

type DevicePermissionConfig = {
  cameraAccess: boolean;
  microphoneAccess: boolean;
  locationAccess: boolean;
};

type AgentLocationRequest = {
  id: string;
  status: string;
  requestedAt: string;
  promptedAt?: string | null;
  expiresAt: string;
  deviceId: string;
};

type AgentLocationResult = {
  requestId: string;
  deviceId: string;
  status: "CAPTURED" | "DENIED" | "FAILED";
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  errorMessage?: string;
  capturedAt?: string;
};

type DesktopLocationResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      capturedAt: string;
      source: string;
    }
  | {
      ok: false;
      reason: "denied" | "unavailable" | "error";
      message: string;
    };

type DesktopLocationPermission =
  | "GRANTED"
  | "DENIED"
  | "UNAVAILABLE"
  | "UNKNOWN";

const dijiAgent = {
  login: async (payload: LoginPayload): Promise<LoginResult> => {
    try {
      return await ipcRenderer.invoke("agent:login", payload);
    } catch (error) {
      return {
        ok: false,
        code: "UNKNOWN_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to communicate with the desktop agent.",
      };
    }
  },

  resumeSession: async (): Promise<LoginResult> => {
    try {
      return await ipcRenderer.invoke("agent:resume-session");
    } catch (error) {
      return {
        ok: false,
        code: "UNKNOWN_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Unable to resume the saved desktop session.",
      };
    }
  },

  updateDevicePermissions: async (
    permissions: AgentDevicePermissions,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      return await ipcRenderer.invoke("agent:update-device-permissions", permissions);
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

  getDevicePermissionConfig: async (): Promise<DevicePermissionConfig> => {
    try {
      return await ipcRenderer.invoke("agent:get-device-permission-config");
    } catch {
      return {
        cameraAccess: false,
        microphoneAccess: false,
        locationAccess: false,
      };
    }
  },

  getLocationRequest: async (): Promise<AgentLocationRequest | null> => {
    try {
      return await ipcRenderer.invoke("agent:get-location-request");
    } catch {
      return null;
    }
  },

  captureDesktopLocation: async (): Promise<DesktopLocationResult> => {
    try {
      return await ipcRenderer.invoke("agent:capture-desktop-location");
    } catch (error) {
      return {
        ok: false,
        reason: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to capture location from this device.",
      };
    }
  },

  probeLocationPermission: async (): Promise<DesktopLocationPermission> => {
    try {
      return await ipcRenderer.invoke("agent:probe-location-permission");
    } catch {
      return "UNKNOWN";
    }
  },

  submitLocationResult: async (
    result: AgentLocationResult,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      return await ipcRenderer.invoke("agent:submit-location-result", result);
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

  onLoginError: (callback: (result: LoginResult) => void): (() => void) => {
    if (typeof callback !== "function") {
      return () => undefined;
    }

    const listener = (
      _event: Electron.IpcRendererEvent,
      result: LoginResult,
    ) => {
      callback(result);
    };

    ipcRenderer.on("agent:login-error", listener);

    return () => {
      ipcRenderer.removeListener("agent:login-error", listener);
    };
  },
};

contextBridge.exposeInMainWorld("dijiAgent", dijiAgent);
