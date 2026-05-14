import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const response = await apiRequest(`/projects/${projectId}/timesheets`, {
    method: "GET",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
