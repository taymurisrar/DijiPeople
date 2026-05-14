import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const response = await apiRequest(`/projects/${projectId}/resources`, {
    method: "POST",
    body: await request.text(),
    headers: { "Content-Type": "application/json" },
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
