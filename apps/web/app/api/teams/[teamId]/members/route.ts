import { NextResponse } from "next/server";
import {
  apiRequest,
  apiRequestJson,
  proxyApiJsonResponse,
} from "@/lib/server-api";

type TeamMembersRouteContext = {
  params: Promise<{ teamId: string }>;
};

export async function GET(_request: Request, context: TeamMembersRouteContext) {
  const { teamId } = await context.params;
  const team = await apiRequestJson<{ members?: TeamMemberRecord[] }>(
    `/teams/${teamId}`,
    { method: "GET" },
  );

  return NextResponse.json({
    records: (team.members ?? []).map(mapMember),
    totalRecords: team.members?.length ?? 0,
  });
}

export async function POST(request: Request, context: TeamMembersRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/members`, {
    method: "POST",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

export async function PUT(request: Request, context: TeamMembersRouteContext) {
  const { teamId } = await context.params;
  const response = await apiRequest(`/teams/${teamId}/members`, {
    method: "PUT",
    body: await request.text(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  return proxyApiJsonResponse(response);
}

type TeamMemberRecord = {
  id: string;
  userId: string;
  isOwner?: boolean;
  createdAt?: string;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
};

function mapMember(member: TeamMemberRecord) {
  const firstName = member.user?.firstName ?? "";
  const lastName = member.user?.lastName ?? "";

  return {
    ...member,
    userName:
      [firstName, lastName].filter(Boolean).join(" ") ||
      member.user?.email ||
      member.userId,
    userEmail: member.user?.email ?? "",
    joinedOn: member.createdAt,
  };
}
