import { NextResponse } from "next/server";
import { apiRequest } from "@/lib/server-api";

export async function GET() {
  try {
    const response = await apiRequest("/attendance/runtime-context", {
      method: "GET",
    });
    return NextResponse.json(await response.json(), {
      status: response.status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to load attendance action context.",
      },
      { status: 500 },
    );
  }
}
