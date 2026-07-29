import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = {
  params: Promise<{ policyId: string }>;
};

export async function GET(_request: Request, context: Context) {
  const { policyId } = await context.params;
  const response = await apiRequest(`/field-security-policies/${policyId}`, {
    method: "GET",
  });
  return proxyApiJsonResponse(response);
}

export async function PATCH(request: Request, context: Context) {
  const { policyId } = await context.params;
  const response = await apiRequest(`/field-security-policies/${policyId}`, {
    method: "PATCH",
    body: await request.text(),
    headers: { "Content-Type": "application/json" },
  });
  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: Context) {
  const { policyId } = await context.params;
  const response = await apiRequest(`/field-security-policies/${policyId}`, {
    method: "DELETE",
  });
  return proxyApiJsonResponse(response);
}
