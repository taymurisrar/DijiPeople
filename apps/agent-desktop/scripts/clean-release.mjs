import { readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Clears previous packaging output so a stale or half-written build cannot be
 * reused (electron-builder otherwise retries steps it already completed and
 * fails with confusing ENOENT renames).
 *
 * Three deliberate choices, each from a failure seen on Windows:
 *  - The `release` directory itself is kept and only its contents are removed.
 *    Editors and Git clients put a recursive watch on the repo, which makes
 *    Windows reject deleting the watched directory with EPERM while still
 *    allowing its children to go.
 *  - Removal is retried for up to RETRY_BUDGET_MS. Defender scans the freshly
 *    built ~90 MB unsigned installer and holds a kernel handle while it does;
 *    that scan outlasts a short retry budget, and the next build then fails
 *    writing over the locked file.
 *  - Failures only warn. This step is hygiene, not correctness, so it must
 *    never be the reason a release build fails.
 */
const RETRY_BUDGET_MS = 60_000;
const RETRY_INTERVAL_MS = 1_000;

const releaseDir = path.resolve(process.cwd(), "release");

if (!existsSync(releaseDir)) {
  console.log("[DijiPeople Agent] No release output to clean.");
  process.exit(0);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeWithRetry(target, label) {
  const deadline = Date.now() + RETRY_BUDGET_MS;
  let lastError;
  let warned = false;

  while (Date.now() < deadline) {
    try {
      rmSync(target, { recursive: true, force: true });
      return { ok: true };
    } catch (error) {
      lastError = error;

      // EPERM/EBUSY here means someone still holds the file; anything else is
      // not going to resolve by waiting.
      if (error.code !== "EPERM" && error.code !== "EBUSY") {
        return { ok: false, error };
      }

      if (!warned) {
        warned = true;
        console.log(
          `[DijiPeople Agent] ${label} is locked (${error.code}); waiting for the lock to clear...`,
        );
      }

      sleep(RETRY_INTERVAL_MS);
    }
  }

  return { ok: false, error: lastError };
}

const skipped = [];

for (const entry of readdirSync(releaseDir)) {
  const result = removeWithRetry(path.join(releaseDir, entry), entry);

  if (!result.ok) {
    skipped.push(`${entry} (${result.error?.code ?? "unknown"})`);
  }
}

if (skipped.length === 0) {
  console.log("[DijiPeople Agent] Release output cleaned.");
} else {
  console.warn(
    `[DijiPeople Agent] Release output partially cleaned. Still locked: ${skipped.join(", ")}.`,
  );
  console.warn(
    "[DijiPeople Agent] Packaging may fail writing over these. Antivirus scanning the previous installer is the usual cause; excluding apps/agent-desktop/release from real-time scanning removes it.",
  );
}
