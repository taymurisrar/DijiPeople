import { messageFromErrorBody } from "./work-items";

/**
 * One call into the thin `/api/work-items` or `/api/work-queues` proxy. The API
 * is the authority on permission and scope; a failure surfaces as its own
 * message.
 */
export async function workRequest<T>(
  resource: "work-items" | "work-queues",
  path: string,
  init: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
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
    throw new Error(
      messageFromErrorBody(
        body,
        response.status === 403
          ? "You do not have permission to do that."
          : "The request failed. Try again.",
      ),
    );
  }
  return body as T;
}
