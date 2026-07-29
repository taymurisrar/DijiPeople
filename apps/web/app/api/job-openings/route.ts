import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(
    `/job-openings${query ? `?${query}` : ""}`,
    {
      method: "GET",
    },
  );

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const body = await request.json();
  const response = await apiRequest("/job-openings", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return proxyApiJsonResponse(response);
}
