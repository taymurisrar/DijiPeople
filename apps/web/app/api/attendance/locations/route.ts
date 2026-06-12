import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/attendance/locations", { method: "GET" });
  return NextResponse.json(await response.json(), { status: response.status });
}
