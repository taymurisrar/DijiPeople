/*
 * How the global client error handler treats an error the browser raised on
 * its own (a window `error` event or an unhandled rejection), as opposed to a
 * failed API call.
 *
 * BUG-3496 — a hydration mismatch (React #418) on two Customization pages
 * opened a full-screen "SYSTEM_UNEXPECTED_ERROR" modal quoting the raw minified
 * React message, and wrote a 500 row to the production client error log on
 * every load. A hydration mismatch is recoverable: React discards the server
 * markup and renders on the client, and the page underneath was working. It is
 * a defect to fix at its source, not a failure to put in front of the user.
 *
 * Kept free of React and browser globals so it can be tested in node.
 */

export type RuntimeErrorDisposition =
  /* Not shown, not persisted. */
  | { kind: "ignore" }
  /* Shown and persisted; `userMessage` replaces text a user cannot act on. */
  | { kind: "report"; userMessage?: string };

/*
 * React's hydration family: text or attributes differ (418), a Suspense
 * boundary finished before hydration (419/422/423), and a hydration error
 * recovered by client rendering (425).
 */
const HYDRATION_ERROR_CODES = new Set(["418", "419", "422", "423", "425"]);

const MINIFIED_REACT_ERROR = /Minified React error #(\d+)/i;

const HYDRATION_MESSAGES = [
  /hydration failed/i,
  /hydration mismatch/i,
  /did not match\. server:/i,
  /text content does not match server-rendered html/i,
  /there was an error while hydrating/i,
];

export const RUNTIME_ERROR_USER_MESSAGE =
  "Something went wrong on this page. Reload it to try again.";

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

export function classifyRuntimeError(error: unknown): RuntimeErrorDisposition {
  const message = messageOf(error);

  if (message.includes("ResizeObserver loop")) {
    return { kind: "ignore" };
  }
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    if (error.name === "AbortError") return { kind: "ignore" };
  }
  if (
    error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "AbortError"
  ) {
    return { kind: "ignore" };
  }

  const minified = MINIFIED_REACT_ERROR.exec(message);
  if (minified && HYDRATION_ERROR_CODES.has(minified[1] ?? "")) {
    return { kind: "ignore" };
  }
  if (HYDRATION_MESSAGES.some((pattern) => pattern.test(message))) {
    return { kind: "ignore" };
  }

  if (minified) {
    return { kind: "report", userMessage: RUNTIME_ERROR_USER_MESSAGE };
  }

  return { kind: "report" };
}
