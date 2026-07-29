import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.toString();
  const response = await apiRequest(
    `/timesheet-policies${query ? `?${query}` : ""}`,
  );
  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  try {
    const response = await apiRequest("/timesheet-policies", {
      method: "POST",
      body: JSON.stringify(await request.json()),
    });
    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create timesheet policy.",
      },
      { status: 500 },
    );
  }
}
