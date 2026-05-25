import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/roles", { method: "GET" });
  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}
