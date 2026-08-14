"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MAX_TILE_ZOOM,
  MIN_TILE_ZOOM,
  clampZoom,
  coordinatesToPixelOffset,
  latitudeToTileY,
  longitudeToTileX,
  metersPerPixel,
  pixelOffsetToCoordinates,
  type Coordinates,
} from "@/lib/location/geo";

const TILE_SIZE = 256;

/**
 * A minimal slippy map: raster tiles, one pin, one radius circle.
 *
 * WHY IT IS HAND-ROLLED. apps/web carries no map library and none of the
 * candidates are dependency-free; adding one for a single settings page would
 * pull a bundle plus its CSS into every route that shares the runtime chunk.
 * What this screen needs is a pin, a circle and a click handler, which is a few
 * dozen lines of Web Mercator arithmetic over plain <img> tiles.
 *
 * Deliberately free of any attendance vocabulary. It knows about a point, a
 * radius and a tile URL, so work sites, client sites and project sites can all
 * use it unchanged.
 */
export function GeofenceMap({
  center,
  radiusMeters,
  interactive = true,
  onCenterChange,
  height = 320,
  tileUrlTemplate = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution = "© OpenStreetMap contributors",
  secondaryPoint,
  secondaryLabel,
  zoom: controlledZoom,
  onZoomChange,
  ariaLabel = "Map",
}: {
  readonly center: Coordinates;
  readonly radiusMeters: number | null;
  readonly interactive?: boolean;
  readonly onCenterChange?: (next: Coordinates) => void;
  readonly height?: number;
  readonly tileUrlTemplate?: string;
  readonly attribution?: string;
  readonly secondaryPoint?: Coordinates | null;
  readonly secondaryLabel?: string;
  readonly zoom?: number;
  readonly onZoomChange?: (zoom: number) => void;
  readonly ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 640, height });
  const [internalZoom, setInternalZoom] = useState(() => clampZoom(controlledZoom ?? 16));
  /* Tracked per template rather than as a bare flag, so pointing the map at a
   * different tile host clears a previous host's failure without an effect. */
  const [failedTileTemplate, setFailedTileTemplate] = useState<string | null>(null);
  const tilesFailed = failedTileTemplate === tileUrlTemplate;
  const [dragging, setDragging] = useState(false);

  const zoom = clampZoom(controlledZoom ?? internalZoom);

  const setZoom = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      setInternalZoom(clamped);
      onZoomChange?.(clamped);
    },
    [onZoomChange],
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const measure = () =>
      setSize({
        width: Math.max(160, element.clientWidth),
        height: Math.max(160, element.clientHeight),
      });

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /*
   * Tiles come from a public host. If it is unreachable — an air-gapped
   * network, a blocking proxy — the surrounding form must stay usable, so a
   * failure downgrades to a placeholder instead of an empty grey box.
   */
  const handleTileError = useCallback(
    () => setFailedTileTemplate(tileUrlTemplate),
    [tileUrlTemplate],
  );

  const toCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      const element = containerRef.current;
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return pixelOffsetToCoordinates({
        center,
        zoom,
        offsetX: clientX - bounds.left,
        offsetY: clientY - bounds.top,
        viewportWidth: bounds.width,
        viewportHeight: bounds.height,
        tileSize: TILE_SIZE,
      });
    },
    [center, zoom],
  );

  const tiles = buildTileGrid(center, zoom, size.width, size.height);
  const pinOffset = coordinatesToPixelOffset({
    center,
    point: center,
    zoom,
    viewportWidth: size.width,
    viewportHeight: size.height,
    tileSize: TILE_SIZE,
  });
  const radiusPixels =
    radiusMeters && radiusMeters > 0
      ? radiusMeters / metersPerPixel(center.latitude, zoom, TILE_SIZE)
      : 0;
  const secondaryOffset = secondaryPoint
    ? coordinatesToPixelOffset({
        center,
        point: secondaryPoint,
        zoom,
        viewportWidth: size.width,
        viewportHeight: size.height,
        tileSize: TILE_SIZE,
      })
    : null;

  return (
    <div className="grid gap-2">
      <div
        aria-label={ariaLabel}
        className={`relative w-full overflow-hidden rounded-2xl border border-border bg-slate-100 ${
          interactive ? (dragging ? "cursor-grabbing" : "cursor-crosshair") : ""
        }`}
        onPointerDown={(event) => {
          if (!interactive || !onCenterChange) return;
          if (event.button !== 0) return;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging || !interactive || !onCenterChange) return;
          const next = toCoordinates(event.clientX, event.clientY);
          if (next) onCenterChange(next);
        }}
        onPointerUp={(event) => {
          if (!interactive || !onCenterChange) return;
          if (dragging) {
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          const next = toCoordinates(event.clientX, event.clientY);
          if (next) onCenterChange(next);
        }}
        onPointerCancel={() => setDragging(false)}
        ref={containerRef}
        role="application"
        style={{ height }}
      >
        {tilesFailed ? (
          <div className="absolute inset-0 grid place-content-center gap-1 p-6 text-center">
            <p className="text-sm font-semibold text-foreground">Map unavailable.</p>
            <p className="text-sm text-muted">
              Map tiles could not be loaded. You can still enter coordinates
              manually.
            </p>
          </div>
        ) : (
          tiles.map((tile) => (
            /* Raster map tiles: fixed 256px, cross-origin, and already sized by
             * the projection. next/image would add a proxy hop and a layout
             * pass for no benefit. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              aria-hidden
              className="pointer-events-none absolute select-none"
              draggable={false}
              height={TILE_SIZE}
              key={`${tile.left}:${tile.top}`}
              onError={handleTileError}
              src={tileUrl(tileUrlTemplate, tile.x, tile.y, zoom)}
              style={{ left: tile.left, top: tile.top }}
              width={TILE_SIZE}
            />
          ))
        )}

        {radiusPixels > 0 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-full border-2 border-accent/70 bg-accent/15"
            style={{
              left: pinOffset.x - radiusPixels,
              top: pinOffset.y - radiusPixels,
              width: radiusPixels * 2,
              height: radiusPixels * 2,
            }}
          />
        ) : null}

        {secondaryOffset ? (
          <div
            aria-hidden
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow"
            style={{ left: secondaryOffset.x, top: secondaryOffset.y }}
            title={secondaryLabel}
          />
        ) : null}

        <div
          aria-hidden
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-accent shadow-md"
          style={{ left: pinOffset.x, top: pinOffset.y }}
        />

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <MapButton
            disabled={zoom >= MAX_TILE_ZOOM}
            label="Zoom in"
            onClick={() => setZoom(zoom + 1)}
          >
            +
          </MapButton>
          <MapButton
            disabled={zoom <= MIN_TILE_ZOOM}
            label="Zoom out"
            onClick={() => setZoom(zoom - 1)}
          >
            −
          </MapButton>
        </div>

        {!tilesFailed ? (
          <p className="absolute bottom-0 right-0 bg-white/80 px-2 py-0.5 text-[10px] text-muted">
            {attribution}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MapButton({
  children,
  disabled,
  label,
  onClick,
}: {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="h-7 w-7 rounded-md border border-border bg-white text-sm font-semibold text-foreground shadow-sm disabled:opacity-40"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      type="button"
    >
      {children}
    </button>
  );
}

function buildTileGrid(
  center: Coordinates,
  zoom: number,
  width: number,
  height: number,
) {
  const centerTileX = longitudeToTileX(center.longitude, zoom);
  const centerTileY = latitudeToTileY(center.latitude, zoom);
  const tilesAcross = Math.ceil(width / TILE_SIZE) + 2;
  const tilesDown = Math.ceil(height / TILE_SIZE) + 2;
  const originX = Math.floor(centerTileX - tilesAcross / 2);
  const originY = Math.floor(centerTileY - tilesDown / 2);
  const maxTile = 2 ** zoom;
  const grid: { x: number; y: number; left: number; top: number }[] = [];

  for (let column = 0; column <= tilesAcross; column += 1) {
    for (let row = 0; row <= tilesDown; row += 1) {
      const tileX = originX + column;
      const tileY = originY + row;
      if (tileY < 0 || tileY >= maxTile) continue;
      grid.push({
        // Longitude wraps, latitude does not.
        x: ((tileX % maxTile) + maxTile) % maxTile,
        y: tileY,
        left: width / 2 + (tileX - centerTileX) * TILE_SIZE,
        top: height / 2 + (tileY - centerTileY) * TILE_SIZE,
      });
    }
  }

  return grid;
}

function tileUrl(template: string, x: number, y: number, z: number) {
  return template
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{z}", String(z));
}
