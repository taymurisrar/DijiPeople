import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await apiRequest(
    `/holiday-calendars${url.search ? url.search : ""}`,
    { method: "GET" },
  );
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const response = await apiRequest("/holiday-calendars", {
    method: "POST",
    body: JSON.stringify(await request.json()),
  });
  return proxyApiJsonResponse(response);
}
