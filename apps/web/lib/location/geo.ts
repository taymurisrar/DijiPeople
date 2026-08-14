/**
 * Coordinate, distance and slippy-map maths.
 *
 * Deliberately free of React, of any map library, and of anything attendance
 * specific: the same helpers serve work sites, client sites, project sites and
 * any future place that needs a pin and a circle. Kept pure so the Node test
 * runner in this app can exercise it without jsdom.
 */

export const EARTH_RADIUS_METERS = 6_371_008.8;

/** Web Mercator cannot represent the poles, so the tile grid stops short. */
export const MAX_MERCATOR_LATITUDE = 85.05112878;

export const MIN_TILE_ZOOM = 2;
export const MAX_TILE_ZOOM = 19;

export type Coordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

export function isValidLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180
  );
}

export function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Coordinates>;
  return isValidLatitude(candidate.latitude) && isValidLongitude(candidate.longitude);
}

/**
 * Parses a coordinate typed into a text field.
 *
 * Returns null rather than NaN or 0 for anything unusable — 0,0 is a real
 * place in the Gulf of Guinea, and silently sending a work site there would be
 * worse than refusing the value.
 */
export function parseCoordinate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Six decimals is roughly 0.1 m — beyond what any consumer GPS resolves. */
export function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function clampLatitude(value: number) {
  return Math.min(90, Math.max(-90, value));
}

/** Longitude wraps rather than clamps: dragging past the date line is legal. */
export function wrapLongitude(value: number) {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

export function normalizeCoordinates(input: {
  readonly latitude: number;
  readonly longitude: number;
}): Coordinates {
  return {
    latitude: roundCoordinate(clampLatitude(input.latitude)),
    longitude: roundCoordinate(wrapLongitude(input.longitude)),
  };
}

/** Great-circle distance in metres. */
export function distanceMeters(from: Coordinates, to: Coordinates) {
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

// --- slippy-map tile maths ---------------------------------------------------

export function longitudeToTileX(longitude: number, zoom: number) {
  return ((longitude + 180) / 360) * 2 ** zoom;
}

export function latitudeToTileY(latitude: number, zoom: number) {
  const clamped = Math.min(
    MAX_MERCATOR_LATITUDE,
    Math.max(-MAX_MERCATOR_LATITUDE, latitude),
  );
  const radians = toRadians(clamped);
  return (
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
    2 ** zoom
  );
}

export function tileXToLongitude(tileX: number, zoom: number) {
  return (tileX / 2 ** zoom) * 360 - 180;
}

export function tileYToLatitude(tileY: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * tileY) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Ground resolution at a latitude, for a 256 px tile scheme. */
export function metersPerPixel(latitude: number, zoom: number, tileSize = 256) {
  const clamped = Math.min(
    MAX_MERCATOR_LATITUDE,
    Math.max(-MAX_MERCATOR_LATITUDE, latitude),
  );
  return (
    (Math.cos(toRadians(clamped)) * 2 * Math.PI * EARTH_RADIUS_METERS) /
    (tileSize * 2 ** zoom)
  );
}

/**
 * The zoom at which a geofence of this radius fills a comfortable share of the
 * viewport — so a 50 m fence is not a dot and a 5 km fence is not off-screen.
 */
export function zoomForRadius(
  radiusMeters: number,
  latitude: number,
  viewportPixels = 320,
) {
  const radius = Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 100;
  const targetPixels = Math.max(40, viewportPixels * 0.3);
  const requiredMetersPerPixel = radius / targetPixels;

  for (let zoom = MAX_TILE_ZOOM; zoom >= MIN_TILE_ZOOM; zoom -= 1) {
    if (metersPerPixel(latitude, zoom) >= requiredMetersPerPixel) return zoom;
  }

  return MIN_TILE_ZOOM;
}

export function clampZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return MIN_TILE_ZOOM;
  return Math.min(MAX_TILE_ZOOM, Math.max(MIN_TILE_ZOOM, Math.round(zoom)));
}

/**
 * Converts a pointer offset inside the map viewport into coordinates.
 *
 * `centerPixel` is where the map centre sits in the viewport, which is simply
 * half its width and height; keeping it a parameter is what makes this testable
 * without a DOM.
 */
export function pixelOffsetToCoordinates(input: {
  readonly center: Coordinates;
  readonly zoom: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly tileSize?: number;
}): Coordinates {
  const tileSize = input.tileSize ?? 256;
  const centerTileX = longitudeToTileX(input.center.longitude, input.zoom);
  const centerTileY = latitudeToTileY(input.center.latitude, input.zoom);
  const deltaTileX = (input.offsetX - input.viewportWidth / 2) / tileSize;
  const deltaTileY = (input.offsetY - input.viewportHeight / 2) / tileSize;

  return normalizeCoordinates({
    latitude: tileYToLatitude(centerTileY + deltaTileY, input.zoom),
    longitude: tileXToLongitude(centerTileX + deltaTileX, input.zoom),
  });
}

/** Where a point sits inside the viewport, in pixels from its top-left. */
export function coordinatesToPixelOffset(input: {
  readonly center: Coordinates;
  readonly point: Coordinates;
  readonly zoom: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly tileSize?: number;
}) {
  const tileSize = input.tileSize ?? 256;
  const centerTileX = longitudeToTileX(input.center.longitude, input.zoom);
  const centerTileY = latitudeToTileY(input.center.latitude, input.zoom);
  const pointTileX = longitudeToTileX(input.point.longitude, input.zoom);
  const pointTileY = latitudeToTileY(input.point.latitude, input.zoom);

  return {
    x: input.viewportWidth / 2 + (pointTileX - centerTileX) * tileSize,
    y: input.viewportHeight / 2 + (pointTileY - centerTileY) * tileSize,
  };
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
