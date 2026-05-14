import { NextRequest, NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const response = await apiRequest(
    `/customers${url.search ? url.search : ""}`,
    { method: "GET" },
  );

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}

export async function POST(request: NextRequest) {
  const response = await apiRequest("/customers", {
    method: "POST",
    body: await request.text(),
    headers: { "Content-Type": "application/json" },
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
