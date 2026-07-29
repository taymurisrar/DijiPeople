import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxyApiJsonResponse(await apiRequest("/timesheet-exports"));
}
export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/timesheet-exports", {
      method: "POST",
      body: await request.text(),
    }),
  );
}
