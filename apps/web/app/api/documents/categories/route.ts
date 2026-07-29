import { NextResponse } from "next/server";
import {
  apiRequestJson,
  getApiErrorMessage,
  isApiRequestError,
} from "@/lib/server-api";

export async function GET() {
  const data = await apiRequestJson<unknown>("/documents/categories", {
    method: "GET",
  });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const data = await apiRequestJson<unknown>("/documents/categories", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        message: getApiErrorMessage(
          error,
          "Unable to create document category.",
        ),
      },
      { status: isApiRequestError(error) ? error.status : 500 },
    );
  }
}
