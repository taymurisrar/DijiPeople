import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/payroll/posting-rules/preview-resolution", {
      method: "POST",
      body: await request.text(),
      headers: { "Content-Type": "application/json" },
    }),
  );
}
