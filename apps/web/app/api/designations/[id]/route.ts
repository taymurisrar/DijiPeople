import { NextResponse } from "next/server";
import {
  apiRequest,
  apiRequestJson,
  getApiErrorMessage,
  isApiRequestError,
  proxyApiJsonResponse,
} from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const data = await apiRequestJson<unknown>(`/designations/${id}`, {
    method: "GET",
  });
  return NextResponse.json(normalizeDesignationRecord(data));
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();

  try {
    const data = await apiRequestJson<unknown>(`/designations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    return NextResponse.json(normalizeDesignationRecord(data));
  } catch (error) {
    return NextResponse.json(
      {
        message: getApiErrorMessage(error, "Unable to update designation."),
      },
      { status: isApiRequestError(error) ? error.status : 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const response = await apiRequest(`/designations/${id}`, {
    method: "DELETE",
  });

  return proxyApiJsonResponse(response);
}

function normalizeDesignationRecord(record: unknown): unknown {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }

  const next = { ...(record as Record<string, unknown>) };
  if (typeof next.code !== "string" && typeof next.level === "string") {
    next.code = next.level;
  }
  return next;
}
