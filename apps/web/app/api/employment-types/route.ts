import { NextResponse } from "next/server";
import { proxyBulkDeleteByIds } from "@/app/api/_lib/bulk-delete";
import {
  apiRequestJson,
  getApiErrorMessage,
  isApiRequestError,
} from "@/lib/server-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const data = await apiRequestJson<unknown>(
    `/employment-types${query ? `?${query}` : ""}`,
    { method: "GET" },
  );
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const data = await apiRequestJson<unknown>("/employment-types", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        message: getApiErrorMessage(
          error,
          "Unable to create employment type.",
        ),
      },
      { status: isApiRequestError(error) ? error.status : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  return proxyBulkDeleteByIds(request, {
    apiPath: "/employment-types",
    entityLabel: "employment type",
    entityPluralLabel: "employment types",
  });
}
