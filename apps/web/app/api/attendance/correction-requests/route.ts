import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const { search } = new URL(request.url);

  try {
    const response = await apiRequest(`/attendance/correction-requests${search}`, {
      method: "GET",
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load attendance correction requests.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/attendance/correction-requests", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create attendance correction request.",
      },
      { status: 500 },
    );
  }
}
