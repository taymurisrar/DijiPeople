import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";
export async function GET() { return proxyApiJsonResponse(await apiRequest("/employee-bank-accounts")); }
export async function POST(request: Request) { return proxyApiJsonResponse(await apiRequest("/employee-bank-accounts", { method: "POST", body: await request.text() })); }
