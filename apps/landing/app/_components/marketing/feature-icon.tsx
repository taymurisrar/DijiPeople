/**
 * Feature icons for the public site.
 *
 * The tenant feature catalogue names its icons with Lucide keys, and Platform
 * Admin renders them with `lucide-react`. The landing app has no icon
 * dependency, and adding one for a marketing page would pull a library into the
 * public bundle for a dozen glyphs — so these are inline SVGs drawn on Lucide's
 * grid (24×24, 2px stroke, round caps) using the same keys.
 *
 * That keeps one consistent set rather than a mix of sources or emoji, and the
 * catalogue stays the single place that decides which icon a feature has.
 *
 * Icons here are decorative: every one sits beside its own visible label, so
 * they carry `aria-hidden` and add nothing for a screen reader to repeat.
 */

type IconProps = {
  className?: string;
};

const STROKE_PROPS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Paths keyed by the catalogue's `icon` value. */
const ICON_PATHS: Record<string, React.ReactNode> = {
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "building-2": (
    <>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
    </>
  ),
  "calendar-days": (
    <>
      <path d="M8 2v4M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </>
  ),
  "clock-3": (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6h4.5" />
    </>
  ),
  "clipboard-list": (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
    </>
  ),
  "folder-kanban": (
    <>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      <path d="M8 10v4M12 10v2M16 10v6" />
    </>
  ),
  "user-plus": (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  "list-checks": (
    <>
      <path d="M3 17l2 2 4-4" />
      <path d="M3 7l2 2 4-4" />
      <path d="M13 6h8M13 12h8M13 18h8" />
    </>
  ),
  "file-stack": (
    <>
      <path d="M21 7h-3a2 2 0 0 1-2-2V2" />
      <path d="M21 6v6a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h5Z" />
      <path d="M7 8v10a2 2 0 0 0 2 2h8" />
      <path d="M3 12v8a2 2 0 0 0 2 2h8" />
    </>
  ),
  bell: (
    <>
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </>
  ),
  palette: (
    <>
      <circle cx="13.5" cy="6.5" r=".5" />
      <circle cx="17.5" cy="10.5" r=".5" />
      <circle cx="8.5" cy="7.5" r=".5" />
      <circle cx="6.5" cy="12.5" r=".5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>
  ),
  // Fallback: a neutral square. Reached only if the catalogue gains an icon key
  // this set does not draw yet, which should render as plain rather than absent.
  default: <rect width="18" height="18" x="3" y="3" rx="3" />,
};

export function FeatureIcon({
  name,
  className = "h-5 w-5",
}: IconProps & { name?: string | null }) {
  const paths = (name && ICON_PATHS[name]) || ICON_PATHS.default;

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...STROKE_PROPS}
    >
      {paths}
    </svg>
  );
}

/** A small tick used in the plan comparison. Decorative — see CheckCell. */
export function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...STROKE_PROPS}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...STROKE_PROPS}
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
