import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxyApiJsonResponse(
    await apiRequest("/employee-schedule-assignments", { method: "GET" }),
  );
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/employee-schedule-assignments", {
      body: JSON.stringify(await request.json()),
      method: "POST",
    }),
  );
}
