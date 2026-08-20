import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

/*
 * BUG-0041 — this handler used to read `sessionUser.permissionKeys`, decide for
 * itself that a caller without `teams.read` could not perform an organizational
 * lookup, and return a fabricated `200 { items: [] }` without calling the API at
 * all.
 *
 * It was fail-closed, so it could only ever withhold data — but that is not the
 * reason to remove it. It was a second source of truth on `teams.read` that the
 * API could never correct, never audit, and never see: a permission grant made
 * server-side would still be denied here, and the denial left no trace anywhere.
 * An empty list is also indistinguishable from "you have no teams", so the
 * caller could not tell a refusal from a result.
 *
 * The API already enforces `teams.read`. Forward the request and forward what it
 * answers, including its refusal.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(`/teams${query ? `?${query}` : ""}`, {
    method: "GET",
  });
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const response = await apiRequest("/teams", {
    method: "POST",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });
  return proxyApiJsonResponse(response);
}
