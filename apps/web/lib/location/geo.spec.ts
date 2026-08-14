import {
  clampZoom,
  coordinatesToPixelOffset,
  distanceMeters,
  isValidLatitude,
  isValidLongitude,
  metersPerPixel,
  normalizeCoordinates,
  parseCoordinate,
  pixelOffsetToCoordinates,
  wrapLongitude,
  zoomForRadius,
} from "./geo";

describe("coordinate validation", () => {
  it("accepts the full legal range and rejects everything beyond it", () => {
    expect(isValidLatitude(0)).toBe(true);
    expect(isValidLatitude(90)).toBe(true);
    expect(isValidLatitude(-90)).toBe(true);
    expect(isValidLatitude(90.0001)).toBe(false);
    expect(isValidLatitude(-91)).toBe(false);
    expect(isValidLatitude(Number.NaN)).toBe(false);
    expect(isValidLatitude("24.86")).toBe(false);

    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180)).toBe(true);
    expect(isValidLongitude(180.1)).toBe(false);
    expect(isValidLongitude(-181)).toBe(false);
  });

  it("parses typed text without turning junk into a real place", () => {
    expect(parseCoordinate("24.8607")).toBe(24.8607);
    expect(parseCoordinate(" -67.0011 ")).toBe(-67.0011);
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate("   ")).toBeNull();
    expect(parseCoordinate("north")).toBeNull();
    expect(parseCoordinate(null)).toBeNull();
    expect(parseCoordinate(Number.NaN)).toBeNull();
  });

  it("clamps latitude but wraps longitude", () => {
    expect(normalizeCoordinates({ latitude: 120, longitude: 10 }).latitude).toBe(90);
    expect(normalizeCoordinates({ latitude: -120, longitude: 10 }).latitude).toBe(-90);
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-190)).toBe(170);
    expect(wrapLongitude(45)).toBe(45);
  });

  it("rounds coordinates to a precision consumer GPS can actually resolve", () => {
    expect(
      normalizeCoordinates({ latitude: 24.86071234567, longitude: 67.00119876 }),
    ).toEqual({ latitude: 24.860712, longitude: 67.001199 });
  });
});

describe("distance", () => {
  it("is zero for the same point", () => {
    const point = { latitude: 24.8607, longitude: 67.0011 };
    expect(Math.round(distanceMeters(point, point))).toBe(0);
  });

  it("measures a known short offset", () => {
    // 0.001 degrees of latitude is ~111 m anywhere on Earth.
    const distance = distanceMeters(
      { latitude: 24.8607, longitude: 67.0011 },
      { latitude: 24.8617, longitude: 67.0011 },
    );
    expect(Math.round(distance)).toBeGreaterThan(105);
    expect(Math.round(distance)).toBeLessThan(118);
  });

  it("is symmetric", () => {
    const a = { latitude: 24.8607, longitude: 67.0011 };
    const b = { latitude: 31.5204, longitude: 74.3587 };
    expect(Math.round(distanceMeters(a, b))).toBe(Math.round(distanceMeters(b, a)));
  });
});

describe("slippy map projection", () => {
  const center = { latitude: 24.8607, longitude: 67.0011 };

  it("puts the centre at the middle of the viewport", () => {
    const offset = coordinatesToPixelOffset({
      center,
      point: center,
      zoom: 16,
      viewportWidth: 640,
      viewportHeight: 320,
    });
    expect(Math.round(offset.x)).toBe(320);
    expect(Math.round(offset.y)).toBe(160);
  });

  it("round-trips a pointer position back to the same coordinates", () => {
    const clicked = pixelOffsetToCoordinates({
      center,
      zoom: 16,
      offsetX: 420,
      offsetY: 100,
      viewportWidth: 640,
      viewportHeight: 320,
    });
    const offset = coordinatesToPixelOffset({
      center,
      point: clicked,
      zoom: 16,
      viewportWidth: 640,
      viewportHeight: 320,
    });
    expect(Math.round(offset.x)).toBe(420);
    expect(Math.round(offset.y)).toBe(100);
  });

  it("moves the pin east when the pointer moves right", () => {
    const clicked = pixelOffsetToCoordinates({
      center,
      zoom: 16,
      offsetX: 500,
      offsetY: 160,
      viewportWidth: 640,
      viewportHeight: 320,
    });
    expect(clicked.longitude).toBeGreaterThan(center.longitude);
    expect(Math.abs(clicked.latitude - center.latitude)).toBeLessThan(0.0001);
  });

  it("shows less ground per pixel as zoom increases", () => {
    expect(metersPerPixel(24.8607, 17)).toBeLessThan(metersPerPixel(24.8607, 16));
  });

  it("keeps the zoom inside the tile scheme", () => {
    expect(clampZoom(99)).toBe(19);
    expect(clampZoom(-4)).toBe(2);
    expect(clampZoom(Number.NaN)).toBe(2);
  });

  it("chooses a closer zoom for a smaller geofence", () => {
    const small = zoomForRadius(50, 24.8607, 320);
    const large = zoomForRadius(500, 24.8607, 320);
    expect(small).toBeGreaterThan(large);
  });

  it("falls back to a usable zoom when the radius is missing", () => {
    expect(zoomForRadius(0, 24.8607, 320)).toBe(zoomForRadius(100, 24.8607, 320));
  });
});
