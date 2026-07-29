import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
import { getSessionUser } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const sessionUser = await getSessionUser();
  const isLookupRequest =
    url.searchParams.get("teamType") === "ORGANIZATIONAL" &&
    (url.searchParams.has("departmentId") ||
      url.searchParams.has("businessUnitId"));
  if (isLookupRequest && !sessionUser?.permissionKeys.includes("teams.read")) {
    return Response.json({ items: [] });
  }
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
