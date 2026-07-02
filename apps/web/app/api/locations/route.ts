import { NextResponse } from "next/server";
import { proxyBulkDeleteByIds } from "@/app/api/_lib/bulk-delete";
import { apiRequest, proxyApiJsonResponse } from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const response = await apiRequest(`/locations${query ? `?${query}` : ""}`, {
    method: "GET",
  });

  return proxyApiJsonResponse(response);
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const response = await apiRequest("/locations", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return proxyApiJsonResponse(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to create location.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  return proxyBulkDeleteByIds(request, {
    apiPath: "/locations",
    entityLabel: "work site",
    entityPluralLabel: "work sites",
  });
}
