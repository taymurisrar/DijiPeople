import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = {
  params: Promise<{ policyId: string; assignmentId: string }>;
};

export async function DELETE(_request: Request, context: Context) {
  const { policyId, assignmentId } = await context.params;
  const response = await apiRequest(
    `/field-security-policies/${policyId}/roles/${assignmentId}`,
    { method: "DELETE" },
  );
  return proxyApiJsonResponse(response);
}
