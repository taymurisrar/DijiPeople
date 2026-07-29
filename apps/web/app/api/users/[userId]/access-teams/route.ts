import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserAccessTeamsRouteContext = {
  params: Promise<{ userId: string }>;
};

export async function GET(
  _request: Request,
  context: UserAccessTeamsRouteContext,
) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/access-teams`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(
  request: Request,
  context: UserAccessTeamsRouteContext,
) {
  const { userId } = await context.params;
  const response = await apiRequest(`/users/${userId}/access-teams`, {
    method: "POST",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}
