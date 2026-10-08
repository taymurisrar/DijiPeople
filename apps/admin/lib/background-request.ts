/**
 * Background requests: calls the console makes on its own, not because an
 * operator pressed something.
 *
 * `ErrorProvider` patches `window.fetch` and opens the blocking error dialog
 * (with "Download log") for every failed `/api/` response. That is right for an
 * action an operator started — they need to know it did not happen — and wrong
 * for the session heartbeat, which fires on every click. When the heartbeat was
 * refused (BUG-3545: `POST /auth/activity` demanded a tenant permission most
 * platform roles do not hold), operators got a "no permission" dialog in the
 * middle of unrelated work, for an action they never took.
 *
 * A background request is marked with a header and the dialog skips it. The
 * mark is on the request, not a URL list, so a new background call opts in
 * where it is written instead of in a list somebody has to remember.
 *
 * A 401 on the heartbeat is still handled: `AdminShell`'s own fetch wrapper
 * refreshes the session or shows the session-expired prompt, and it treats the
 * heartbeat as an ordinary authenticated call even though it lives under
 * `/api/auth/`. Only the generic error dialog is skipped.
 */
export const BACKGROUND_REQUEST_HEADER = "x-dijipeople-background";

/** The session heartbeat `AdminShell` sends on operator activity. */
export const SESSION_HEARTBEAT_PATH = "/api/auth/activity";

export function isSessionHeartbeat(url: string) {
  try {
    return (
      new URL(url, "http://console.invalid").pathname === SESSION_HEARTBEAT_PATH
    );
  } catch {
    return url === SESSION_HEARTBEAT_PATH;
  }
}

/** `init` with the background mark added, keeping any headers it had. */
export function backgroundRequestInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set(BACKGROUND_REQUEST_HEADER, "1");
  return { ...init, headers };
}

/** Was this fetch call marked as background? Reads `init` and a `Request`. */
export function isBackgroundRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  if (init?.headers && new Headers(init.headers).has(BACKGROUND_REQUEST_HEADER))
    return true;
  return (
    typeof Request !== "undefined" &&
    input instanceof Request &&
    input.headers.has(BACKGROUND_REQUEST_HEADER)
  );
}

/**
 * Reported requests: an operator started them, and the control that started them
 * shows the outcome itself (the record action bar notice, a quick-create panel
 * error). An expected domain refusal - a 4xx carrying a catalog code such as
 * PARTNER_INVITATION_COOLDOWN - is then already explained where the operator is
 * looking, and the blocking dialog with Technical details and Download log on
 * top of it turns a business rule into an apparent crash. A 5xx is unexpected and
 * the dialog's log is how it gets reported, so it still raises the dialog. A
 * background request, by contrast, never raises it.
 */
export const REPORTED_REQUEST_HEADER = "x-dijipeople-reported";

/** `init` with the reported mark added, keeping any headers it had. */
export function reportedRequestInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set(REPORTED_REQUEST_HEADER, "1");
  return { ...init, headers };
}

/** Was this fetch call marked as reported? Reads `init` and a `Request`. */
export function isReportedRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  if (init?.headers && new Headers(init.headers).has(REPORTED_REQUEST_HEADER))
    return true;
  return (
    typeof Request !== "undefined" &&
    input instanceof Request &&
    input.headers.has(REPORTED_REQUEST_HEADER)
  );
}

/**
 * Should a finished `/api/` request raise the blocking error dialog?
 *
 * Kept pure so the rule is testable without a DOM; `ErrorProvider` calls it.
 */
export function shouldRaiseErrorDialog({
  url,
  ok,
  background,
  reported = false,
  status,
}: {
  url: string;
  ok: boolean;
  background: boolean;
  reported?: boolean;
  status?: number;
}) {
  if (ok || background) return false;
  if (reported && status !== undefined && status >= 400 && status < 500)
    return false;
  if (!url.includes("/api/")) return false;
  // The client error log reports failures; it must never raise one itself.
  if (url.includes("/api/error-logs/")) return false;
  return true;
}
