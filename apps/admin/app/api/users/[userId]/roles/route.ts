import { NextResponse } from "next/server";

export async function PUT() {
  return NextResponse.json(
    { message: "Tenant role assignment is not available for platform users." },
    { status: 410 },
  );
}
