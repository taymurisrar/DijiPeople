import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  return proxy("/admin/demo-data/summary");
}

export async function DELETE() {
  return proxy("/admin/demo-data", { method: "DELETE" });
}

export async function POST() {
  return proxy("/admin/demo-data/reseed", { method: "POST" });
}

async function proxy(path: string, init?: RequestInit) {
  try {
    return proxyApiJsonResponse(await apiRequest(path, init));
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
