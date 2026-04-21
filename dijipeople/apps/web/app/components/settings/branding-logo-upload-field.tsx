"use client";

import { ChangeEvent, useMemo, useState } from "react";

type BrandingLogoUploadFieldProps = {
  description?: string;
  label: string;
  onChange: (value: string) => void;
  settingKey: string;
  value: string;
};

const ALLOWED_FILE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;

const DIMENSION_RULES: Record<
  string,
  { minWidth: number; minHeight: number; helper: string }
> = {
  logoUrl: {
    minWidth: 240,
    minHeight: 80,
    helper: "Recommended minimum: 240 x 80",
  },
  squareLogoUrl: {
    minWidth: 128,
    minHeight: 128,
    helper: "Recommended minimum: 128 x 128",
  },
  faviconUrl: {
    minWidth: 32,
    minHeight: 32,
    helper: "Recommended minimum: 32 x 32",
  },
  emailHeaderLogoUrl: {
    minWidth: 200,
    minHeight: 60,
    helper: "Recommended minimum: 200 x 60",
  },
  loginBannerImageUrl: {
    minWidth: 1200,
    minHeight: 600,
    helper: "Recommended minimum: 1200 x 600",
  },
};

export function BrandingLogoUploadField({
  description,
  label,
  onChange,
  settingKey,
  value,
}: BrandingLogoUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rule = useMemo(() => DIMENSION_RULES[settingKey], [settingKey]);

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);
    setMessage(null);

    if (!ALLOWED_FILE_TYPES.has(file.type.toLowerCase())) {
      setError("Only PNG, JPG, WEBP, and SVG files are supported.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File is too large. Maximum allowed size is 3 MB.");
      return;
    }

    if (rule && file.type !== "image/svg+xml") {
      const dimensionError = await validateImageDimensions(
        file,
        rule.minWidth,
        rule.minHeight,
      );
      if (dimensionError) {
        setError(dimensionError);
        return;
      }
    }

    setIsUploading(true);

    try {
      const payload = new FormData();
      payload.set("settingKey", settingKey);
      payload.set("file", file);

      const response = await fetch("/api/tenant-settings/branding-assets", {
        method: "POST",
        body: payload,
      });

      const data = (await response.json().catch(() => null)) as
        | { message?: string; value?: string }
        | null;

      if (!response.ok || !data?.value) {
        setError(
          data?.message ?? "Branding asset upload failed. Please try again.",
        );
        setIsUploading(false);
        return;
      }

      onChange(data.value);
      setMessage("Asset uploaded and branding updated.");
    } catch {
      setError("Branding asset upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="grid gap-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <div className="rounded-2xl border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${label} preview`}
              className="h-12 w-24 rounded-lg border border-border object-contain bg-surface"
              src={value}
            />
          ) : (
            <div className="flex h-12 w-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
              No asset
            </div>
          )}

          <label className="inline-flex cursor-pointer items-center rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground hover:border-accent/40 hover:text-accent">
            {isUploading ? "Uploading..." : "Upload asset"}
            <input
              accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              disabled={isUploading}
              onChange={handleFileSelect}
              type="file"
            />
          </label>
        </div>

        <p className="mt-2 text-xs text-muted">
          Allowed: PNG, JPG, WEBP, SVG. Maximum size: 3 MB.
          {rule ? ` ${rule.helper}.` : ""}
        </p>
      </div>

      {description ? <span className="text-xs text-muted">{description}</span> : null}
      {message ? <span className="text-xs text-emerald-700">{message}</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

async function validateImageDimensions(
  file: File,
  minWidth: number,
  minHeight: number,
) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    if (image.naturalWidth < minWidth || image.naturalHeight < minHeight) {
      return `Image dimensions are too small. Minimum recommended size is ${minWidth}x${minHeight}.`;
    }
    return null;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load selected image."));
    image.src = src;
  });
}
