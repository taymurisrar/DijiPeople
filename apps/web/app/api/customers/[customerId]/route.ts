import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { customerId } = await context.params;
  const response = await apiRequest(`/customers/${customerId}`, {
    method: "GET",
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { customerId } = await context.params;
  const response = await apiRequest(`/customers/${customerId}`, {
    method: "PATCH",
    body: await request.text(),
    headers: { "Content-Type": "application/json" },
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
