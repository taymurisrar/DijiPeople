import { messageFromErrorBody } from "./work-items";

/** A refusal from the API, with the HTTP status so a screen can tell 403 from the rest. */
export class WorkRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WorkRequestError";
    this.status = status;
  }
}

/**
 * One call into the thin `/api/work-items`, `/api/work-queues` or
 * `/api/work-blockers` proxy. The API is the authority on permission and scope;
 * a failure surfaces as its own message.
 */
export async function workRequest<T>(
  resource:
    | "work-items"
    | "work-queues"
    | "work-blockers"
    | "work-duties"
    | "work-meetings"
    | "work-decisions"
    | "contributions"
    | "daily-updates",
  path: string,
  init: {
    method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    body?: unknown;
  } = {},
): Promise<T> {
  const response = await fetch(`/api/${resource}${path}`, {
    method: init.method ?? "GET",
    cache: "no-store",
    headers:
      init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new WorkRequestError(
      messageFromErrorBody(
        body,
        response.status === 403
          ? "You do not have permission to do that."
          : "The request failed. Try again.",
      ),
      response.status,
    );
  }
  return body as T;
}
