import { NextResponse } from "next/server";
import {
  apiRequestJson,
  getApiErrorMessage,
  isApiRequestError,
} from "@/lib/server-api";

type BulkDeleteOptions = {
  readonly apiPath: string;
  readonly entityLabel: string;
  readonly entityPluralLabel?: string;
};

export async function proxyBulkDeleteByIds(
  request: Request,
  options: BulkDeleteOptions,
) {
  const body = await request.json().catch(() => null);
  const recordIds = readRecordIds(body);

  if (recordIds.length === 0) {
    return NextResponse.json(
      { message: `Select at least one ${options.entityLabel} to delete.` },
      { status: 400 },
    );
  }

  const apiPath = options.apiPath.replace(/\/+$/, "");
  const pluralLabel =
    options.entityPluralLabel ?? `${options.entityLabel.replace(/\.$/, "")}s`;

  try {
    await Promise.all(
      recordIds.map((recordId) =>
        apiRequestJson<unknown>(`${apiPath}/${encodeURIComponent(recordId)}`, {
          method: "DELETE",
        }),
      ),
    );

    return NextResponse.json({ deletedIds: recordIds });
  } catch (error) {
    return NextResponse.json(
      { message: getApiErrorMessage(error, `Unable to delete ${pluralLabel}.`) },
      { status: isApiRequestError(error) ? error.status : 500 },
    );
  }
}

function readRecordIds(body: unknown) {
  if (!body || typeof body !== "object") return [];

  const record = body as { recordIds?: unknown; ids?: unknown };
  const value = Array.isArray(record.recordIds) ? record.recordIds : record.ids;

  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .filter((recordId): recordId is string => typeof recordId === "string")
        .map((recordId) => recordId.trim())
        .filter(Boolean),
    ),
  ];
}
