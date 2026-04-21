import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, getApiBaseUrl } from "@/lib/auth-config";

type JsonRecord = Record<string, unknown>;

export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest(path: string, init?: RequestInit) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const headers = new Headers(init?.headers);

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function apiRequestJson<T>(path: string, init?: RequestInit) {
  const response = await apiRequest(path, init);
  const rawBody = await response.text();
  const data = rawBody ? safeParseJson(rawBody) : null;

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      extractErrorMessage(data) ?? `Request failed with status ${response.status}.`,
    );
  }

  return data as T;
}

export async function proxyApiJsonResponse(response: Response) {
  const rawBody = await response.text();
  const data = rawBody ? safeParseJson(rawBody) : null;

  if (data) {
    return NextResponse.json(data, { status: response.status });
  }

  return NextResponse.json(
    {
      message: response.ok
        ? "Request succeeded without a JSON body."
        : response.statusText || "Request failed.",
    },
    { status: response.status },
  );
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as JsonRecord;
  } catch {
    return null;
  }
}

function extractErrorMessage(data: JsonRecord | null) {
  if (!data) {
    return null;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (Array.isArray(data.message) && data.message.every((item) => typeof item === "string")) {
    return data.message.join(", ");
  }

  return null;
}
