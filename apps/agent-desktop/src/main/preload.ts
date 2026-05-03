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