import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/payroll/employer-bank-accounts/actions/import", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
