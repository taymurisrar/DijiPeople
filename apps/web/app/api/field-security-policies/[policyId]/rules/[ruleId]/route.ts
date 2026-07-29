import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = {
  params: Promise<{ policyId: string; ruleId: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const { policyId, ruleId } = await context.params;
  const response = await apiRequest(
    `/field-security-policies/${policyId}/rules/${ruleId}`,
    {
      method: "PATCH",
      body: await request.text(),
      headers: { "Content-Type": "application/json" },
    },
  );
  return proxyApiJsonResponse(response);
}

export async function DELETE(_request: Request, context: Context) {
  const { policyId, ruleId } = await context.params;
  const response = await apiRequest(
    `/field-security-policies/${policyId}/rules/${ruleId}`,
    { method: "DELETE" },
  );
  return proxyApiJsonResponse(response);
}
