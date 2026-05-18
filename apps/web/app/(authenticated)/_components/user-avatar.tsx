"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type UserAvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  imageSrc?: string | null;
  cacheKey?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-9 w-9 text-sm",
  md: "h-11 w-11 text-base",
  lg: "h-24 w-24 text-2xl",
} as const;

export function UserAvatar({
  firstName,
  lastName,
  imageSrc,
  cacheKey,
  size = "md",
  className = "",
}: UserAvatarProps) {
  const initials = getInitials(firstName, lastName);
  const [hasImageError, setHasImageError] = useState(false);
  const src = imageSrc
    ? cacheKey
      ? `${imageSrc}${imageSrc.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}`
      : imageSrc
    : null;

  useEffect(() => {
    setHasImageError(false);
  }, [src]);

  return (
    <div
      className={[
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-strong font-semibold text-foreground",
        sizeClasses[size],
        className,
      ].join(" ")}
    >
      {src && !hasImageError ? (
        <Image
          alt={buildAltText(firstName, lastName)}
          className="object-cover"
          fill
          sizes={size === "lg" ? "96px" : size === "md" ? "44px" : "36px"}
          src={src}
          unoptimized
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function getInitials(firstName?: string | null, lastName?: string | null) {
  const value = `${firstName || ""} ${lastName || ""}`
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return value || "DP";
}

function buildAltText(firstName?: string | null, lastName?: string | null) {
  const fullName = `${firstName || ""} ${lastName || ""}`.trim();
  return fullName ? `${fullName} avatar` : "User avatar";
}
