import { NextResponse } from "next/server";
import {
  apiRequest,
  apiRequestJson,
  proxyApiJsonResponse,
} from "@/lib/server-api";

type TeamRolesRouteContext = {
  params: Promise<{ teamId: string }>;
};

export async function GET(_request: Request, context: TeamRolesRouteContext) {
  const { teamId } = await context.params;
  const team = await apiRequestJson<{ teamRoles?: TeamRoleRecord[] }>(
    `/teams/${teamId}`,
    { method: "GET" },
  );

  return NextResponse.json({
    records: (team.teamRoles ?? []).map(mapTeamRole),
    totalRecords: team.teamRoles?.length ?? 0,
  });
}

export async function POST(request: Request, context: TeamRolesRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/roles`, {
    method: "POST",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

export async function PUT(request: Request, context: TeamRolesRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/roles`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

type TeamRoleRecord = {
  id: string;
  roleId: string;
  createdAt?: string;
  role?: {
    id: string;
    key?: string;
    name?: string;
    description?: string | null;
    accessLevel?: string | null;
  };
};

function mapTeamRole(assignment: TeamRoleRecord) {
  return {
    ...assignment,
    roleName: assignment.role?.name ?? assignment.roleId,
    roleKey: assignment.role?.key ?? "",
    roleDescription: assignment.role?.description ?? "",
    accessLevel: assignment.role?.accessLevel ?? "",
    assignedOn: assignment.createdAt,
  };
}
