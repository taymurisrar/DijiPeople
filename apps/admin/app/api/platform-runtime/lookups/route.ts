import { NextResponse } from "next/server";
import { apiRequestJson, ApiRequestError } from "@/lib/server-api";
import { listPlatformModuleDefinitions } from "@/lib/runtime/platform-module-registry";
import {
  buildRuntimeLookupPath,
  collectRuntimeLookupPaths,
  normalizeRuntimeLookupPayload,
} from "@/lib/runtime/runtime-lookups";

const ALLOWED_LOOKUPS = collectRuntimeLookupPaths(
  listPlatformModuleDefinitions(),
);

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const source = parameters.get("path") ?? "";
  if (!ALLOWED_LOOKUPS.has(source)) {
    return NextResponse.json(
      { message: "Lookup is not available." },
      { status: 400 },
    );
  }

  try {
    const payload = await apiRequestJson<unknown>(
      buildRuntimeLookupPath(source, parameters.get("search") ?? undefined),
    );
    return NextResponse.json({ items: normalizeRuntimeLookupPayload(payload) });
  } catch (error) {
    const status = error instanceof ApiRequestError ? error.status : 502;
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to load lookup.",
      },
      { status },
    );
  }
}
