import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

type Context = {
  params: Promise<{ policyId: string }>;
};

export async function GET(_request: Request, context: Context) {
  const { policyId } = await context.params;
  const response = await apiRequest(
    `/field-security-policies/${policyId}/access-teams`,
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request, context: Context) {
  const { policyId } = await context.params;
  const response = await apiRequest(
    `/field-security-policies/${policyId}/access-teams`,
    {
      method: "POST",
      body: await request.text(),
      headers: { "Content-Type": "application/json" },
    },
  );
  return proxyApiJsonResponse(response);
}
