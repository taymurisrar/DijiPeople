import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * Resolves a bundled asset for both `electron .` (assets sit beside src) and a
 * packaged build (assets are inside app.asar, which Electron's patched fs and
 * nativeImage can both read).
 */
export function resolveAgentAsset(fileName: string): string | null {
  const candidates = new Set<string>();

  try {
    candidates.add(path.join(app.getAppPath(), "assets", fileName));
  } catch {
    // app may not be ready in some test contexts.
  }

  candidates.add(path.resolve(__dirname, "../../assets", fileName));
  candidates.add(path.resolve(__dirname, "../assets", fileName));

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore unreadable candidates and try the next one.
    }
  }

  return null;
}
