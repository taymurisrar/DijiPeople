import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The slice of `electron` the testable modules touch.
 *
 * `offline-queue` reaches Electron for exactly one thing: `app.getPath`, to
 * decide where its journal file lives. Everything else about it — what is
 * re-sent, in what order, what is dropped when bounded — is ordinary logic that
 * happens to sit behind that one import.
 *
 * `userData` is a fresh temp directory per run, so a spec writes a real file
 * through the real `fs` and the atomic write-then-rename path is exercised
 * rather than mocked away. Mocking `fs` here would test the mock. ITEM-0033.
 */
const userDataRoot = mkdtempSync(join(tmpdir(), "dijipeople-agent-test-"));

export const app = {
  getPath(name: string): string {
    return join(userDataRoot, name);
  },
  getVersion(): string {
    return "0.0.0-test";
  },
};

export const ipcMain = { handle: () => undefined, on: () => undefined };
export const shell = { openExternal: async () => undefined };

/**
 * `activity-tracker` asks the OS how long the user has been idle. A stub with a
 * settable value lets a spec state the idle time and assert the state that
 * follows, which is the decision worth testing — the OS call itself is not.
 */
export const powerMonitor = {
  idleSeconds: 0,
  getSystemIdleTime(): number {
    return powerMonitor.idleSeconds;
  },
};

export default { app, ipcMain, shell, powerMonitor };
