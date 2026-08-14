/**
 * Server-side geocoding against the provider this product already uses.
 *
 * No API key and no account: the attendance reverse-geocode route has called
 * this same public endpoint since location capture shipped, and forward search
 * is the sibling call on the same service. Introducing a paid provider for one
 * settings screen would be a much larger decision than this feature needs.
 *
 * Every failure resolves to an empty result rather than throwing. Address
 * lookup is an assist; the map click and the manual coordinate fields are the
 * guaranteed paths, and they must not break when a public service rate-limits.
 */

const NOMINATIM_ORIGIN = "https://nominatim.openstreetmap.org";
const USER_AGENT = "DijiPeople/1.0 location-configuration";

export type GeocodeSuggestion = {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly postalCode?: string;
};

export async function searchAddresses(query: string): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  try {
    const response = await fetch(
      `${NOMINATIM_ORIGIN}/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(
        trimmed,
      )}`,
      {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        cache: "no-store",
      },
    );
    if (!response.ok) return [];

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];

    return payload
      .map((entry) => toSuggestion(entry))
      .filter((item): item is GeocodeSuggestion => item !== null);
  } catch {
    return [];
  }
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodeSuggestion | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  try {
    const response = await fetch(
      `${NOMINATIM_ORIGIN}/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${encodeURIComponent(
        String(latitude),
      )}&lon=${encodeURIComponent(String(longitude))}`,
      {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    return toSuggestion(payload, { latitude, longitude });
  } catch {
    return null;
  }
}

function toSuggestion(
  entry: unknown,
  fallbackCoordinates?: { latitude: number; longitude: number },
): GeocodeSuggestion | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as {
    display_name?: unknown;
    lat?: unknown;
    lon?: unknown;
    address?: Record<string, string | undefined>;
  };

  const address = row.address ?? {};
  const label =
    (typeof row.display_name === "string" ? row.display_name.trim() : "") ||
    composeAddressLabel(address);
  const latitude = Number(row.lat);
  const longitude = Number(row.lon);
  const resolvedLatitude = Number.isFinite(latitude)
    ? latitude
    : (fallbackCoordinates?.latitude ?? Number.NaN);
  const resolvedLongitude = Number.isFinite(longitude)
    ? longitude
    : (fallbackCoordinates?.longitude ?? Number.NaN);

  if (
    !label ||
    !Number.isFinite(resolvedLatitude) ||
    !Number.isFinite(resolvedLongitude)
  ) {
    return null;
  }

  return {
    label,
    latitude: resolvedLatitude,
    longitude: resolvedLongitude,
    city: address.city ?? address.town ?? address.village ?? address.municipality,
    state: address.state ?? address.region ?? address.county,
    country: address.country,
    postalCode: address.postcode,
  };
}

function composeAddressLabel(address: Record<string, string | undefined>) {
  const parts = [
    address.house_number,
    address.road,
    address.suburb,
    address.neighbourhood,
    address.city_district,
    address.town,
    address.village,
    address.city,
    address.county,
    address.state,
    address.postcode,
    address.country,
  ].filter(Boolean);

  return parts.length ? Array.from(new Set(parts)).join(", ") : "";
}
