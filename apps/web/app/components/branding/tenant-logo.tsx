"use client";

import { DEFAULT_BRANDING_VALUES } from "./branding-defaults";

/*
 * Three ways a logo resolves, in order.
 *
 * 1. The tenant uploaded artwork — always wins.
 * 2. No artwork, and the brand is still the platform's own name — this is
 *    DijiPeople itself (or a tenant that has not been branded at all), so the
 *    platform mark is correct.
 * 3. No artwork, and the brand has been renamed — a customer tenant. It gets
 *    its own initials, never the vendor's mark.
 *
 * Rule 3 is the important one: showing the DijiPeople logo to a tenant called
 * something else is the leak that was reported before. Rule 2 is what was
 * missing — the platform's own portal fell through to a generic grid icon that
 * looked like a broken image.
 */

/* Reversed artwork for dark grounds, primary for light. */
const PLATFORM_LOGO = "/logo-primary-horizontal.svg";
const PLATFORM_LOGO_REVERSED = "/logo-reversed-dark-bg.svg";

type TenantLogoProps = {
  className?: string;
  fallbackClassName?: string;
  logoUrl?: string | null;
  name?: string | null;
  /* Set when the logo sits on a dark ground, so the reversed mark is used. */
  onDarkBackground?: boolean;
  sizeClassName?: string;
};

/** "Xoul Ltd" becomes "XL"; a single word gives its first two letters. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function TenantLogo({
  className,
  fallbackClassName,
  logoUrl,
  name,
  onDarkBackground = false,
  sizeClassName = "h-10 w-10",
}: TenantLogoProps) {
  const effectiveName =
    typeof name === "string" && name.trim().length > 0
      ? name.trim()
      : DEFAULT_BRANDING_VALUES.brandName;

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${effectiveName} logo`}
        className={`${sizeClassName} rounded-2xl border border-border/70 bg-white object-contain ${className ?? ""}`}
        src={logoUrl}
      />
    );
  }

  const isPlatformBrand =
    effectiveName.toLowerCase() ===
    DEFAULT_BRANDING_VALUES.brandName.toLowerCase();

  if (isPlatformBrand) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={`${effectiveName} logo`}
        className={`${sizeClassName} object-contain ${className ?? ""}`}
        src={onDarkBackground ? PLATFORM_LOGO_REVERSED : PLATFORM_LOGO}
      />
    );
  }

  return (
    <div
      className={`${sizeClassName} flex items-center justify-center rounded-2xl bg-accent/10 font-semibold text-accent ${fallbackClassName ?? ""}`}
      title={effectiveName}
    >
      {initialsOf(effectiveName)}
    </div>
  );
}
