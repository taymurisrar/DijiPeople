import { NextResponse } from "next/server";
import { apiRequest, ApiRequestError, proxyApiJsonResponse } from "@/lib/server-api";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const response = await apiRequest("/timesheets/template/import/preview", {
      body: formData,
      method: "POST",
      timeoutMs: 60_000,
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : 500;

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to preview timesheet import.",
      },
      { status },
    );
  }
}
