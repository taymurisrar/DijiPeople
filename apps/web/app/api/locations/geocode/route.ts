import { NextResponse } from "next/server";
import { reverseGeocode, searchAddresses } from "@/lib/location/geocoding.server";

/**
 * Address lookup for location configuration screens.
 *
 * One route serves both directions: `?q=` searches an address, `?latitude=&
 * longitude=` suggests an address for a point. Both go through the server so
 * the provider never sees a browser referrer and the usage policy's User-Agent
 * requirement is honoured.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const latitude = Number(params.get("latitude"));
  const longitude = Number(params.get("longitude"));

  if (query) {
    return NextResponse.json({ results: await searchAddresses(query) });
  }

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const suggestion = await reverseGeocode(latitude, longitude);
    return NextResponse.json({ results: suggestion ? [suggestion] : [] });
  }

  return NextResponse.json({ results: [] });
}
