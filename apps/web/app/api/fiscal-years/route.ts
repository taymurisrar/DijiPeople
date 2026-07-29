import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  return proxyApiJsonResponse(
    await apiRequest(
      `/fiscal-years${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    ),
  );
}

export async function POST(request: Request) {
  return proxyApiJsonResponse(
    await apiRequest("/fiscal-years", {
      method: "POST",
      body: JSON.stringify(await request.json()),
    }),
  );
}
