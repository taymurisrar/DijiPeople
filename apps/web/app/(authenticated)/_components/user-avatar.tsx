"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type UserAvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

type UserAvatarStatus = "online" | "away" | "busy" | "offline" | "none";

type UserAvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  imageSrc?: string | null;
  cacheKey?: string | null;
  size?: UserAvatarSize;
  status?: UserAvatarStatus;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  showBorder?: boolean;
  priority?: boolean;
  title?: string;
};

const sizeClasses: Record<UserAvatarSize, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-20 w-20 text-xl",
  "2xl": "h-24 w-24 text-2xl",
};

const imageSizes: Record<UserAvatarSize, string> = {
  xs: "28px",
  sm: "36px",
  md: "44px",
  lg: "64px",
  xl: "80px",
  "2xl": "96px",
};

const statusClasses: Record<Exclude<UserAvatarStatus, "none">, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-500",
  busy: "bg-rose-500",
  offline: "bg-slate-400",
};

const statusSizeClasses: Record<UserAvatarSize, string> = {
  xs: "h-2 w-2 border",
  sm: "h-2.5 w-2.5 border",
  md: "h-3 w-3 border-2",
  lg: "h-3.5 w-3.5 border-2",
  xl: "h-4 w-4 border-2",
  "2xl": "h-4.5 w-4.5 border-2",
};

export function UserAvatar({
  firstName,
  lastName,
  fullName,
  imageSrc,
  cacheKey,
  size = "md",
  status = "none",
  className = "",
  imageClassName = "",
  fallbackClassName = "",
  showBorder = true,
  priority = false,
  title,
}: UserAvatarProps) {
  const displayName = getDisplayName({ firstName, lastName, fullName });
  const initials = getInitials(displayName);

  const src = useMemo(
    () => buildImageSrc(imageSrc, cacheKey),
    [imageSrc, cacheKey],
  );

  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const shouldShowImage = Boolean(src && failedSrc !== src);

  return (
    <div
      title={title ?? displayName}
      className={[
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-strong font-semibold uppercase leading-none text-foreground shadow-sm",
        showBorder ? "border border-border" : "",
        sizeClasses[size],
        className,
      ].join(" ")}
    >
      {shouldShowImage && src ? (
        <Image
          alt={displayName ? `${displayName} avatar` : "User avatar"}
          className={[
            "object-cover",
            imageClassName,
          ].join(" ")}
          fill
          priority={priority}
          sizes={imageSizes[size]}
          src={src}
          unoptimized
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={[
            "select-none",
            fallbackClassName,
          ].join(" ")}
        >
          {initials}
        </span>
      )}

      {status !== "none" ? (
        <span
          aria-label={`User is ${status}`}
          className={[
            "absolute bottom-0 right-0 rounded-full border-white shadow-sm",
            statusClasses[status],
            statusSizeClasses[size],
          ].join(" ")}
        />
      ) : null}
    </div>
  );
}

function buildImageSrc(imageSrc?: string | null, cacheKey?: string | null) {
  const normalizedSrc = imageSrc?.trim();

  if (!normalizedSrc) {
    return null;
  }

  const normalizedCacheKey = cacheKey?.trim();

  if (!normalizedCacheKey) {
    return normalizedSrc;
  }

  return `${normalizedSrc}${
    normalizedSrc.includes("?") ? "&" : "?"
  }v=${encodeURIComponent(normalizedCacheKey)}`;
}

function getDisplayName({
  firstName,
  lastName,
  fullName,
}: {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}) {
  const explicitFullName = fullName?.trim();

  if (explicitFullName) {
    return explicitFullName;
  }

  return `${firstName ?? ""} ${lastName ?? ""}`.trim();
}

function getInitials(displayName: string) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "DP";
}