import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = searchParams.get("latitude");
  const longitude = searchParams.get("longitude");

  if (!latitude || !longitude) {
    return NextResponse.json(
      { message: "Latitude and longitude are required." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        latitude,
      )}&lon=${encodeURIComponent(longitude)}&zoom=16&addressdetails=1`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "DijiPeople/1.0 attendance-reverse-geocode",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return NextResponse.json({ addressText: null });
    }

    const data = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };

    const addressText = buildAddressText(data);
    return NextResponse.json({ addressText });
  } catch {
    return NextResponse.json({ addressText: null });
  }
}

function buildAddressText(data: {
  display_name?: string;
  address?: Record<string, string | undefined>;
}) {
  const address = data.address ?? {};
  const parts = [
    address.suburb,
    address.neighbourhood,
    address.city_district,
    address.city,
    address.state,
    address.country,
  ].filter(Boolean);

  if (parts.length > 0) {
    return Array.from(new Set(parts)).join(", ");
  }

  return data.display_name ?? null;
}
