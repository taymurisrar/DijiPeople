/*
 * Classification for the `(authenticated)` error boundary.
 *
 * BUG-2013 — this logic used to live inside `error.tsx` and decided everything
 * by string-matching `error.message`. That works for a failure thrown in a
 * client component, where the real message survives. It cannot work for a
 * failure thrown in a *server* component: React replaces the message with a
 * fixed production placeholder ("Minified React error #441 …") before the
 * client boundary ever sees it, deliberately, so server detail does not leak.
 * Every server-side 401, 403, 404 and 500 therefore fell through four
 * guaranteed-to-miss string tests and rendered the same "UNEXPECTED ERROR"
 * screen, which is what made BUG-2003 and BUG-2004 indistinguishable.
 *
 * It lives here, free of JSX, so it can be tested in the node-environment jest
 * setup that `apps/web` has. `error.tsx` maps the returned variant to an icon.
 */

export type DashboardErrorVariant =
  | "session-expired"
  | "access-denied"
  | "not-found"
  | "api-error"
  | "server-error"
  | "unexpected";

export type DashboardErrorPrimaryAction = "login" | "retry" | "dashboard";

/** The shape Next hands the boundary, plus the fields our own errors carry. */
export type DashboardErrorLike = {
  readonly message?: string;
  readonly digest?: string;
  readonly status?: number;
  readonly statusCode?: number;
  readonly code?: string;
};

export type DashboardErrorConfig = {
  readonly variant: DashboardErrorVariant;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly toneClassName: string;
  readonly primaryAction: DashboardErrorPrimaryAction;
};

const CONFIGS: Record<DashboardErrorVariant, DashboardErrorConfig> = {
  "session-expired": {
    variant: "session-expired",
    eyebrow: "Session expired",
    title: "Your session is no longer valid.",
    description:
      "Please sign in again to continue working safely in your workspace. Any unsaved changes may need to be re-entered.",
    toneClassName: "border-amber-200 bg-amber-50 text-amber-700",
    primaryAction: "login",
  },
  "access-denied": {
    variant: "access-denied",
    eyebrow: "Access denied",
    title: "You do not have access to this page.",
    description:
      "Your account is active, but this feature is not available for your current role, permission set, business unit, or tenant scope.",
    toneClassName: "border-red-200 bg-red-50 text-red-700",
    primaryAction: "dashboard",
  },
  "not-found": {
    variant: "not-found",
    eyebrow: "Record not found",
    title: "The requested page or record could not be found.",
    description:
      "It may have been deleted, moved, archived, or you may no longer have visibility based on your current access scope.",
    toneClassName: "border-slate-200 bg-slate-50 text-slate-700",
    primaryAction: "dashboard",
  },
  "api-error": {
    variant: "api-error",
    eyebrow: "Service unavailable",
    title: "The system could not load this page right now.",
    description:
      "This usually happens when the API, database, network, or authentication service is temporarily unavailable.",
    toneClassName: "border-orange-200 bg-orange-50 text-orange-700",
    primaryAction: "retry",
  },
  /*
   * The server-component case. We deliberately do not guess which HTTP outcome
   * caused it: the message was stripped, so any guess would be a fabrication.
   * What we can do — and what the boundary now does — is name the failure
   * honestly and put the digest on screen, because the digest is the only key
   * into the runtime log line that still holds the real message.
   */
  "server-error": {
    variant: "server-error",
    eyebrow: "Server error",
    title: "This page failed to load on the server.",
    description:
      "The details are recorded in the server log rather than shown here. Share the error reference below with support — it identifies the exact failure.",
    toneClassName: "border-orange-200 bg-orange-50 text-orange-700",
    primaryAction: "retry",
  },
  unexpected: {
    variant: "unexpected",
    eyebrow: "Unexpected error",
    title: "We hit an unexpected problem while loading this page.",
    description:
      "Please try again. If this keeps happening, share the error reference with your administrator or support team.",
    toneClassName: "border-slate-200 bg-slate-50 text-slate-700",
    primaryAction: "retry",
  },
};

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase();
}

export function getDashboardErrorStatus(error: DashboardErrorLike) {
  return error.status ?? error.statusCode;
}

/*
 * React's RSC Flight browser client builds this message in `resolveErrorProd()`
 * for every server-component throw in a production build. The un-minified build
 * of the same function spells the sentence out instead of using the error code,
 * so both forms are recognised.
 */
export function isServerComponentPlaceholder(message: string) {
  const normalized = normalize(message);
  return (
    normalized.includes("minified react error #441") ||
    normalized.includes("an error occurred in the server components render")
  );
}

export function classifyDashboardError(
  error: DashboardErrorLike,
): DashboardErrorConfig {
  const status = getDashboardErrorStatus(error);

  /*
   * An explicit HTTP status is authoritative and is read before anything else.
   * It used to be tested inside each branch, below the message heuristics of
   * the branch above it, so a 404 whose message happened to contain the word
   * "permission" rendered as ACCESS DENIED (BUG-2014).
   */
  if (status !== undefined) {
    if (status === 401) return CONFIGS["session-expired"];
    if (status === 403) return CONFIGS["access-denied"];
    if (status === 404) return CONFIGS["not-found"];
    if (status >= 500 || status === 408) return CONFIGS["api-error"];
  }

  /*
   * A server-component throw. Checked before the message heuristics because the
   * placeholder text contains none of the words they look for and would fall
   * through all four of them to "unexpected".
   */
  if (isServerComponentPlaceholder(error.message ?? "")) {
    return CONFIGS["server-error"];
  }

  const code = normalize(error.code);

  if (
    code.includes("unauthorized") ||
    code.includes("token_expired")
  ) {
    return CONFIGS["session-expired"];
  }

  if (code.includes("forbidden")) return CONFIGS["access-denied"];
  if (code.includes("not_found")) return CONFIGS["not-found"];

  /*
   * Everything below matches on `error.message`, which means it is reachable
   * only for failures thrown in *client* components — a server component's
   * message never survives to this point. Do not add server-side conditions
   * here; carry the status on the error instead, or let the server component
   * render its own typed state, which is what `users/[userId]` does.
   */
  const message = normalize(error.message);

  if (
    message.includes("access token") ||
    message.includes("refresh token") ||
    message.includes("jwt expired") ||
    message.includes("session expired") ||
    message.includes("invalid or expired") ||
    message.includes("unauthorized")
  ) {
    return CONFIGS["session-expired"];
  }

  if (
    message.includes("forbidden") ||
    message.includes("permission") ||
    message.includes("access denied") ||
    message.includes("not allowed") ||
    message.includes("not authorized")
  ) {
    return CONFIGS["access-denied"];
  }

  if (
    message.includes("not found") ||
    message.includes("record does not exist")
  ) {
    return CONFIGS["not-found"];
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout")
  ) {
    return CONFIGS["api-error"];
  }

  return CONFIGS.unexpected;
}
