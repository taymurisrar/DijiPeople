import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";
import { proxyErrorResponse } from "@/app/api/_lib/proxy-error";

export async function GET() {
  try {
    const response = await apiRequest("/attendance/runtime-context", {
      method: "GET",
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
    });
  } catch (error) {
    return proxyErrorResponse(error, "Unable to load attendance action context.");
  }
}
