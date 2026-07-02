import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
export async function GET(request: Request) { return proxyApiJsonResponse(await apiRequest(`/loans${new URL(request.url).search}`)); }
export async function POST(request: Request) { return proxyApiJsonResponse(await apiRequest("/loans", { method: "POST", body: await request.text() })); }
