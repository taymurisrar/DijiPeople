import { NextResponse } from "next/server";
import {
  PARTNER_ACCESS_COOKIE,
  PARTNER_REFRESH_COOKIE,
} from "@/lib/partner-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(PARTNER_ACCESS_COOKIE);
  response.cookies.delete(PARTNER_REFRESH_COOKIE);
  return response;
}
