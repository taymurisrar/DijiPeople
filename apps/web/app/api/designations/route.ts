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
    `/designations${query ? `?${query}` : ""}`,
    { method: "GET" },
  );

  return NextResponse.json(normalizeDesignationPayload(data));
}

export async function POST(request: Request) {
  const body = await request.json();

  try {
    const data = await apiRequestJson<unknown>("/designations", {
      method: "POST",
      body: JSON.stringify(body),
    });

    return NextResponse.json(normalizeDesignationPayload(data));
  } catch (error) {
    return NextResponse.json(
      {
        message: getApiErrorMessage(error, "Unable to create designation."),
      },
      { status: isApiRequestError(error) ? error.status : 500 },
    );
  }
}

export async function DELETE(request: Request) {
  return proxyBulkDeleteByIds(request, {
    apiPath: "/designations",
    entityLabel: "designation",
    entityPluralLabel: "designations",
  });
}

function normalizeDesignationPayload(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(normalizeDesignationRecord);
  if (!data || typeof data !== "object") return data;

  const record = data as Record<string, unknown>;
  const next = { ...record };
  for (const key of ["items", "records", "data", "results"] as const) {
    if (Array.isArray(next[key])) {
      next[key] = next[key].map(normalizeDesignationRecord);
    }
  }

  return normalizeDesignationRecord(next);
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
