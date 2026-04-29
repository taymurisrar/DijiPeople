import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("dijiAgent", {
  login: (email: string, password: string) =>
    ipcRenderer.invoke("agent:login", { email, password }),
  onLoginError: (callback: (message: string) => void) => {
    ipcRenderer.on("agent:login-error", (_event, message: string) =>
      callback(message),
    );
  },
});
