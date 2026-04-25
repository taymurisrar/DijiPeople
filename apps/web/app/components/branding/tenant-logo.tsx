"use client";

import { Grid3X3 } from "lucide-react";
import { DEFAULT_BRANDING_VALUES } from "./branding-defaults";

type TenantLogoProps = {
  className?: string;
  fallbackClassName?: string;
  logoUrl?: string | null;
  name?: string | null;
  sizeClassName?: string;
};

export function TenantLogo({
  className,
  fallbackClassName,
  logoUrl,
  name,
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

  return (
    <div
      className={`${sizeClassName} flex items-center justify-center rounded-2xl bg-accent/10 text-accent ${fallbackClassName ?? ""}`}
    >
      <Grid3X3 className="h-5 w-5" />
    </div>
  );
}
