import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();

  const response = await apiRequest(
    `/users${query ? `?${query}` : ""}`,
    {
      method: "GET",
    },
  );

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  try {
    const body = await request.text();

    const response = await apiRequest("/users", {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Unable to create user.",
      },
      { status: 500 },
    );
  }
}