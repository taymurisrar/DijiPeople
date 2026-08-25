import { createHash } from "node:crypto";
import { desktopCapturer, screen } from "electron";
import type {
  DlpForegroundProvider,
  DlpScreenshotCapturer,
} from "./dlp-manager";
import type { ForegroundApp } from "./rule-evaluator";

/**
 * Electron/native adapters for DLP capture (TASK-0020). Kept apart from
 * DlpManager and the pure detection modules so those stay unit-testable without
 * an Electron main process; this file is the untested Electron edge, like `tray`
 * and `main` (see apps/agent-desktop/AGENTS.md › Testing).
 */

/** Reads the foreground application via `active-win`, the same source the
 * activity tracker uses. */
export class ActiveWindowForegroundProvider implements DlpForegroundProvider {
  async current(): Promise<ForegroundApp> {
    try {
      const { default: activeWin } = await import("active-win");
      const window = await activeWin();
      return {
        name: window?.owner?.name ?? null,
        path: window?.owner?.path ?? null,
      };
    } catch {
      // A failed read means "unknown foreground this tick", not a crash.
      return { name: null, path: null };
    }
  }
}

/** Captures the primary display via Electron's desktopCapturer. */
export class ElectronScreenshotCapturer implements DlpScreenshotCapturer {
  async capture(): Promise<{
    imageBase64: string;
    contentSha256: string;
    contentBytes: number;
  } | null> {
    try {
      const { size } = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: size.width, height: size.height },
      });
      const source = sources[0];
      if (!source) return null;

      const png = source.thumbnail.toPNG();
      return {
        imageBase64: png.toString("base64"),
        contentSha256: createHash("sha256").update(png).digest("hex"),
        contentBytes: png.length,
      };
    } catch {
      return null;
    }
  }
}
