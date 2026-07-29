import { NextResponse } from "next/server";
import {
  apiRequestJson,
  getApiErrorMessage,
  isApiRequestError,
} from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const data = await apiRequestJson<unknown>(
    `/employment-types/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  return NextResponse.json(data);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  try {
    const data = await apiRequestJson<unknown>(
      `/employment-types/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        message: getApiErrorMessage(
          error,
          "Unable to update employment type.",
        ),
      },
      { status: isApiRequestError(error) ? error.status : 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const data = await apiRequestJson<unknown>(
      `/employment-types/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        message: getApiErrorMessage(
          error,
          "Unable to delete employment type.",
        ),
      },
      { status: isApiRequestError(error) ? error.status : 500 },
    );
  }
}
