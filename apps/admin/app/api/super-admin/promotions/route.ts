import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxy("GET");
}

export async function POST(request: Request) {
  return proxy("POST", await request.text());
}

async function proxy(method: "GET" | "POST", body?: string) {
  try {
    const response = await apiRequest("/super-admin/promotions", {
      method,
      body,
      headers: body ? { "Content-Type": "application/json" } : undefined,
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to reach the API.",
      },
      { status: 502 },
    );
  }
}
