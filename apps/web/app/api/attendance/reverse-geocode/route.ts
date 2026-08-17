import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/location/geocoding.server";

/**
 * Address text for an attendance punch location.
 *
 * BUG-0041 — this handler used to call `nominatim.openstreetmap.org` itself,
 * with its own copy of the query, its own address-assembly logic, and
 * `forwardedClientHeaders(request)` spread into the outbound headers.
 *
 * That last part is the sharp end. `forwardedClientHeaders` exists so the *API*
 * can see the visitor's address for per-client rate limiting across this app's
 * proxy hop (BUG-0032). Spreading it into a third-party request instead sent
 * every employee's IP to OpenStreetMap alongside their exact punch coordinates —
 * a linkable location trace handed to an outside service, from a helper whose
 * documented purpose is the opposite hop.
 *
 * `lib/location/geocoding.server.ts` already does this correctly and says so:
 * server-side, no browser referrer, no client headers, one User-Agent honouring
 * the provider's usage policy. This route now uses it, which removes the IP
 * leak and the duplicated address assembly together.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json(
      { message: "Latitude and longitude are required." },
      { status: 400 },
    );
  }

  const suggestion = await reverseGeocode(latitude, longitude);
  return NextResponse.json({ addressText: suggestion?.label ?? null });
}
