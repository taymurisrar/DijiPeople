import { NextResponse } from "next/server";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "team" ? "team" : "mine";
  const query = new URLSearchParams(url.searchParams);
  query.delete("scope");

  const response = await apiRequest(
    `/leave-requests/${scope}${query.toString() ? `?${query.toString()}` : ""}`,
    {
      method: "GET",
    },
  );

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/leave-requests", {
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
            : "Unable to submit leave request.",
      },
      { status: 500 },
    );
  }
}
