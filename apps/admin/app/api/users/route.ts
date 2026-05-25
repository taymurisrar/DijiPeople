import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/platform-users", { method: "GET" });
  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const response = await apiRequest("/platform-users", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return NextResponse.json(payload, { status: response.status });
}
