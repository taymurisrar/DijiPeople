import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/settings/my-preferences", {
    method: "GET",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.text();
  const response = await apiRequest("/settings/my-preferences", {
    method: "PATCH",
    body,
    headers: { "Content-Type": "application/json" },
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
