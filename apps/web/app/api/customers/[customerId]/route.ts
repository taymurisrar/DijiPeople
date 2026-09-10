import { NextRequest } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ customerId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { customerId } = await context.params;
  const response = await apiRequest(`/customers/${customerId}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { customerId } = await context.params;
  const response = await apiRequest(`/customers/${customerId}`, {
    method: "PATCH",
    body: await request.text(),
    headers: { "Content-Type": "application/json" },
  });

  return proxyApiJsonResponse(response);
}

// BUG-2007 - real delete. Refused by the API with a reasoned error when the
// customer still owns a project; this route stays a thin proxy either way.
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { customerId } = await context.params;
  const response = await apiRequest(`/customers/${customerId}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}
