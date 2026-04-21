import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET() {
  const response = await apiRequest("/payroll/compensations", {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/payroll/compensations", {
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
            : "Unable to assign employee compensation.",
      },
      { status: 500 },
    );
  }
}

