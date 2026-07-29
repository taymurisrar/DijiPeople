import { NextResponse } from "next/server";
import { apiRequestJson } from "@/lib/server-api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const data = await apiRequestJson<unknown>(
    `/leave-policies/${encodeURIComponent(id)}/assignments`,
    { method: "GET" },
  );
  return NextResponse.json(data);
}
