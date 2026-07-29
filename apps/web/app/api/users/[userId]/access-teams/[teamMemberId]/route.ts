import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type UserAccessTeamRecordRouteContext = {
  params: Promise<{ userId: string; teamMemberId: string }>;
};

export async function PATCH(
  request: Request,
  context: UserAccessTeamRecordRouteContext,
) {
  const { userId, teamMemberId } = await context.params;
  const response = await apiRequest(
    `/users/${userId}/access-teams/${teamMemberId}`,
    {
      method: "PATCH",
      body: await request.text(),
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return proxyApiJsonResponse(response);
}

export async function DELETE(
  _request: Request,
  context: UserAccessTeamRecordRouteContext,
) {
  const { userId, teamMemberId } = await context.params;
  const response = await apiRequest(
    `/users/${userId}/access-teams/${teamMemberId}`,
    {
      method: "DELETE",
    },
  );

  return proxyApiJsonResponse(response);
}
