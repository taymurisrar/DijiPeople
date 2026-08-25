import { createHash } from "node:crypto";

/**
 * The slice of Electron's `clipboard` this watcher needs. Injected rather than
 * imported so the watcher runs — and is tested — without an Electron main
 * process. In production this is `electron.clipboard`.
 */
export interface ClipboardReader {
  readText(): string;
}

/**
 * One reportable clipboard change. `text` is present only in full-content mode
 * and only when the content is within the byte cap; otherwise the sample is
 * metadata only. The hash and byte count are always present, so even an
 * oversized or metadata-only sample proves *that* a copy happened and how large
 * it was, without the content ever leaving the machine.
 *
 * Content is never truncated-then-kept: an over-cap sample carries `text: null`,
 * not a partial string, so a stored exhibit is always the whole clipboard or
 * nothing.
 */
export type ClipboardSample = {
  text: string | null;
  contentBytes: number;
  contentSha256: string;
  overCap: boolean;
};

export type ClipboardPollOptions = {
  fullContent: boolean;
  maxBytes: number;
};

/**
 * Emits a sample when the clipboard text changes, and nothing otherwise. It
 * holds only the hash of the last seen content — never the content — so the
 * watcher itself keeps nothing sensitive in memory between polls.
 *
 * `prime` records the current clipboard as the baseline without emitting, so the
 * content that merely happened to be on the clipboard when tracking started is
 * not captured; only what the employee copies afterwards is. The session manager
 * primes once when capture begins.
 */
export class ClipboardWatcher {
  private lastHash: string | null = null;

  prime(reader: ClipboardReader): void {
    const text = safeReadText(reader);
    this.lastHash = text.length === 0 ? null : sha256Hex(text);
  }

  reset(): void {
    this.lastHash = null;
  }

  poll(
    reader: ClipboardReader,
    options: ClipboardPollOptions,
  ): ClipboardSample | null {
    const text = safeReadText(reader);

    // An empty clipboard is not a capture and is not a baseline. Leaving
    // `lastHash` untouched means clearing the clipboard between two copies of the
    // same thing does not swallow the second copy.
    if (text.length === 0) {
      return null;
    }

    const hash = sha256Hex(text);
    if (hash === this.lastHash) {
      return null;
    }

    this.lastHash = hash;

    const contentBytes = Buffer.byteLength(text, "utf8");
    const overCap = contentBytes > Math.max(0, options.maxBytes);
    const keepText = options.fullContent && !overCap;

    return {
      text: keepText ? text : null,
      contentBytes,
      contentSha256: hash,
      overCap,
    };
  }
}

function safeReadText(reader: ClipboardReader): string {
  try {
    const value = reader.readText();
    return typeof value === "string" ? value : "";
  } catch {
    // A clipboard read can throw on Windows when another process holds the
    // clipboard open. Treat it as "nothing to report this poll" rather than
    // letting it bubble into the capture loop.
    return "";
  }
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
