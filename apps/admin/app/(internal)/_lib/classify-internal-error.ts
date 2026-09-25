import { humanizeErrorMessage } from "@/lib/runtime/humanize-field-error";

/*
 * Classification for the `(internal)` route-group error boundary (BUG-3220).
 *
 * Kept free of JSX so it can be unit-tested under `apps/admin`'s jest config,
 * which has no jsdom (pure logic only, per `apps/admin/AGENTS.md`).
 *
 * Next.js redacts a Server Component's real `error.message` in production
 * before `error.tsx` ever sees it (replaced by a generic React placeholder,
 * `apps/web`'s `_lib/classify-dashboard-error.ts` documents this in more
 * detail for the same reason) — an explicit `status`/`code` carried on the
 * thrown error (as `ApiRequestError` from `lib/server-api.ts` does) survives
 * that redaction and is checked first for that reason.
 */

export type InternalErrorLike = {
  readonly message?: string;
  readonly digest?: string;
  readonly status?: number;
  readonly statusCode?: number;
  readonly code?: string;
  readonly traceId?: string;
  readonly description?: string;
};

export type InternalErrorDescription = {
  readonly title: string;
  readonly description: string;
  readonly referenceId?: string;
};

const STATUS_MESSAGES: Record<number, { title: string; description: string }> = {
  401: {
    title: "Your session is no longer valid.",
    description: "Sign in again to continue.",
  },
  403: {
    title: "You do not have access to this page.",
    description:
      "Your role or permission set does not include this feature.",
  },
  404: {
    title: "The requested page or record could not be found.",
    description:
      "It may have been removed, or you may no longer have visibility for it.",
  },
};

/*
 * React's RSC client builds this message for a Server Component throw in a
 * production build; the un-minified build spells the sentence out instead of
 * using the error code, so both forms are recognised. Mirrors
 * `apps/web`'s `isServerComponentPlaceholder` — kept as a second small copy
 * rather than a cross-app import, since neither app depends on the other.
 */
export function isServerComponentPlaceholder(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("minified react error #441") ||
    normalized.includes("an error occurred in the server components render")
  );
}

export function describeInternalError(
  error: InternalErrorLike,
): InternalErrorDescription {
  const status = error.status ?? error.statusCode;
  const referenceId =
    error.traceId ?? error.digest ?? error.code ?? undefined;

  if (status !== undefined && STATUS_MESSAGES[status]) {
    return { ...STATUS_MESSAGES[status], referenceId };
  }

  if (status !== undefined && status >= 500) {
    return {
      title: "The system could not load this page right now.",
      description:
        error.description ??
        "This usually means the API, database or an integration is temporarily unavailable.",
      referenceId,
    };
  }

  const rawMessage = (error.message ?? "").trim();
  if (rawMessage && !isServerComponentPlaceholder(rawMessage)) {
    return {
      title: "Something went wrong loading this page.",
      description: humanizeErrorMessage(rawMessage),
      referenceId,
    };
  }

  return {
    title: "Something went wrong loading this page.",
    description:
      "The details are recorded in the server log. Try again, and share the reference below with support if it keeps happening.",
    referenceId,
  };
}
