"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandingHeadEffects } from "@/app/components/branding/branding-head-effects";
import {
  ConfirmationDialog,
  SideToast,
  TopAlert,
} from "@/app/components/notifications";
import { ColorPickerField } from "@/app/components/settings";
import {
  BRANDING_COLOR_KEYS,
  BRANDING_FONT_OPTIONS,
  BRANDING_TEXT_KEYS,
  BrandingColorKey,
  BrandingSettings,
  BrandingTextKey,
  DEFAULT_BRANDING_SETTINGS,
  getFontOptionByKey,
  isValidHexColor,
} from "@/lib/branding";

type BrandingSettingsFormProps = {
  initialValues: BrandingSettings;
};

type ToastState = {
  description?: string;
  title: string;
  variant: "success" | "error" | "warning" | "info";
};

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);
const ALLOWED_FAVICON_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
const MAX_LOGO_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_FAVICON_SIZE_BYTES = 1 * 1024 * 1024;

const COLOR_FIELD_LABELS: Record<BrandingColorKey, string> = {
  primaryColor: "Primary color",
  secondaryColor: "Secondary color",
  accentColor: "Accent color",
  backgroundColor: "Background color",
  surfaceColor: "Surface / card color",
  textColor: "Text color",
};

const COLOR_FIELD_DESCRIPTIONS: Record<BrandingColorKey, string> = {
  primaryColor: "Main action and navigation emphasis color.",
  secondaryColor: "Supporting color for highlights and subtle emphasis.",
  accentColor: "Accent used for links, helper badges, and UI cues.",
  backgroundColor: "Base page background color for branded areas.",
  surfaceColor: "Card and panel background color.",
  textColor: "Primary text color for headings and body text.",
};

const TEXT_FIELD_LABELS: Record<BrandingTextKey, string> = {
  appTitle: "App/page title",
  brandName: "Company/display name",
  shortBrandName: "Short display name",
  portalTagline: "Tagline / short description",
  welcomeTitle: "Login/welcome heading",
  welcomeSubtitle: "Login/welcome subtext",
  footerText: "Footer text",
  dashboardGreeting: "Dashboard greeting",
  employeePortalMessage: "Employee portal message",
};

export function BrandingSettingsForm({ initialValues }: BrandingSettingsFormProps) {
  const router = useRouter();
  const [savedBranding, setSavedBranding] = useState<BrandingSettings>(initialValues);
  const [draftBranding, setDraftBranding] = useState<BrandingSettings>(initialValues);
  const [isSaving, setIsSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [faviconPreviewUrl, setFaviconPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [topAlert, setTopAlert] = useState<{
    description?: string;
    title: string;
    variant: "warning" | "error" | "info" | "success";
  } | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    setSavedBranding(initialValues);
    setDraftBranding(initialValues);
    setLogoFile(null);
    setFaviconFile(null);
    setLogoPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setFaviconPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, [initialValues]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
      if (faviconPreviewUrl) {
        URL.revokeObjectURL(faviconPreviewUrl);
      }
    };
  }, [faviconPreviewUrl, logoPreviewUrl]);

  const isDirty = useMemo(
    () =>
      JSON.stringify(draftBranding) !== JSON.stringify(savedBranding) ||
      Boolean(logoFile) ||
      Boolean(faviconFile),
    [draftBranding, faviconFile, logoFile, savedBranding],
  );

  const invalidColors = useMemo(
    () =>
      BRANDING_COLOR_KEYS.filter((key) => !isValidHexColor(draftBranding[key])),
    [draftBranding],
  );

  const hasValidFont = useMemo(
    () => BRANDING_FONT_OPTIONS.some((option) => option.key === draftBranding.fontFamily),
    [draftBranding.fontFamily],
  );

  const previewLogoUrl = logoPreviewUrl ?? draftBranding.logoUrl;
  const previewFaviconUrl = faviconPreviewUrl ?? draftBranding.faviconUrl;

  const previewStyle = useMemo(
    () =>
      ({
        "--dp-primary": draftBranding.primaryColor,
        "--dp-secondary": draftBranding.secondaryColor,
        "--dp-accent": draftBranding.accentColor,
        "--dp-background": draftBranding.backgroundColor,
        "--dp-surface": draftBranding.surfaceColor,
        "--dp-text": draftBranding.textColor,
        "--dp-font-family": getFontOptionByKey(draftBranding.fontFamily).stack,
      }) as CSSProperties,
    [draftBranding],
  );

  async function handleSave() {
    if (invalidColors.length > 0) {
      setTopAlert({
        title: "Invalid color values",
        description:
          "Please correct invalid hex values before saving branding settings.",
        variant: "warning",
      });
      return;
    }

    if (!hasValidFont) {
      setTopAlert({
        title: "Invalid font option",
        description: "Please select one of the supported font families.",
        variant: "warning",
      });
      return;
    }

    setTopAlert(null);
    await persistBranding(draftBranding);
  }

  async function persistBranding(nextDraft: BrandingSettings) {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setToast(null);

    try {
      let nextLogoUrl = nextDraft.logoUrl;
      let nextFaviconUrl = nextDraft.faviconUrl;

      if (logoFile) {
        nextLogoUrl = await uploadBrandingAsset("logoUrl", logoFile);
      }

      if (faviconFile) {
        nextFaviconUrl = await uploadBrandingAsset("faviconUrl", faviconFile);
      }

      const payload = {
        updates: [
          ...BRANDING_COLOR_KEYS.map((key) => ({
            category: "branding",
            key,
            value: nextDraft[key].trim(),
          })),
          ...BRANDING_TEXT_KEYS.map((key) => ({
            category: "branding",
            key,
            value: nextDraft[key].trim(),
          })),
          { category: "branding", key: "fontFamily", value: nextDraft.fontFamily },
          { category: "branding", key: "logoUrl", value: nextLogoUrl.trim() },
          { category: "branding", key: "faviconUrl", value: nextFaviconUrl.trim() },
          {
            category: "branding",
            key: "appBackgroundColor",
            value: nextDraft.backgroundColor.trim(),
          },
          {
            category: "branding",
            key: "appSurfaceColor",
            value: nextDraft.surfaceColor.trim(),
          },
        ],
      };

      const response = await fetch("/api/tenant-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        setToast({
          title: "Branding save failed",
          description:
            body?.message ?? "Unable to save branding settings right now.",
          variant: "error",
        });
        setIsSaving(false);
        return;
      }

      const persisted: BrandingSettings = {
        ...nextDraft,
        logoUrl: nextLogoUrl,
        faviconUrl: nextFaviconUrl,
      };

      setSavedBranding(persisted);
      setDraftBranding(persisted);
      clearFileDrafts();
      setToast({
        title: "Branding updated",
        description: "Changes were saved and applied successfully.",
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      setToast({
        title: "Branding save failed",
        description:
          error instanceof Error
            ? error.message
            : "Unable to save branding settings right now.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function clearFileDrafts() {
    setLogoFile(null);
    setFaviconFile(null);
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    if (faviconPreviewUrl) {
      URL.revokeObjectURL(faviconPreviewUrl);
    }
    setLogoPreviewUrl(null);
    setFaviconPreviewUrl(null);
  }

  function handleRevertDraft() {
    setDraftBranding(savedBranding);
    clearFileDrafts();
    setTopAlert(null);
  }

  async function handleResetToDefaults() {
    setShowResetDialog(false);
    setTopAlert(null);
    await persistBranding(DEFAULT_BRANDING_SETTINGS);
  }

  function handleTextChange(key: BrandingTextKey, value: string) {
    setDraftBranding((current) => ({ ...current, [key]: value }));
  }

  function handleColorChange(key: BrandingColorKey, value: string) {
    setDraftBranding((current) => ({ ...current, [key]: value }));
  }

  function handleDirectUrlChange(key: "logoUrl" | "faviconUrl", value: string) {
    if (key === "logoUrl" && logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(null);
      setLogoFile(null);
    }

    if (key === "faviconUrl" && faviconPreviewUrl) {
      URL.revokeObjectURL(faviconPreviewUrl);
      setFaviconPreviewUrl(null);
      setFaviconFile(null);
    }

    setDraftBranding((current) => ({ ...current, [key]: value }));
  }

  function handleFilePick(kind: "logo" | "favicon", file: File | null) {
    if (!file) {
      return;
    }

    const typeSet = kind === "logo" ? ALLOWED_LOGO_TYPES : ALLOWED_FAVICON_TYPES;
    const maxSize = kind === "logo" ? MAX_LOGO_SIZE_BYTES : MAX_FAVICON_SIZE_BYTES;

    if (!typeSet.has(file.type.toLowerCase())) {
      setTopAlert({
        title: "Unsupported image format",
        description:
          kind === "logo"
            ? "Logo supports PNG, JPG, WEBP, and SVG."
            : "Favicon supports PNG, JPG, WEBP, SVG, and ICO.",
        variant: "warning",
      });
      return;
    }

    if (file.size > maxSize) {
      setTopAlert({
        title: "Image file too large",
        description:
          kind === "logo"
            ? "Logo must be 3 MB or smaller."
            : "Favicon must be 1 MB or smaller.",
        variant: "warning",
      });
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    if (kind === "logo") {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
      setLogoFile(file);
      setLogoPreviewUrl(previewUrl);
    } else {
      if (faviconPreviewUrl) {
        URL.revokeObjectURL(faviconPreviewUrl);
      }
      setFaviconFile(file);
      setFaviconPreviewUrl(previewUrl);
    }
  }

  return (
    <div className="grid gap-6 pb-20">
      <BrandingHeadEffects
        faviconUrl={previewFaviconUrl}
        title={draftBranding.appTitle}
      />

      {topAlert ? (
        <TopAlert
          description={topAlert.description}
          onDismiss={() => setTopAlert(null)}
          title={topAlert.title}
          variant={topAlert.variant}
        />
      ) : null}

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-foreground">Brand identity</h3>
        <p className="mt-2 text-sm text-muted">
          Configure brand assets and core product display text.
        </p>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <AssetField
            accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
            fileLabel={logoFile?.name}
            label="Logo image"
            onFileSelect={(file) => handleFilePick("logo", file)}
            onUrlChange={(value) => handleDirectUrlChange("logoUrl", value)}
            previewAlt="Logo preview"
            previewUrl={previewLogoUrl}
            urlValue={draftBranding.logoUrl}
          />

          <AssetField
            accept=".png,.jpg,.jpeg,.webp,.svg,.ico,image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
            fileLabel={faviconFile?.name}
            label="Favicon image"
            onFileSelect={(file) => handleFilePick("favicon", file)}
            onUrlChange={(value) => handleDirectUrlChange("faviconUrl", value)}
            previewAlt="Favicon preview"
            previewUrl={previewFaviconUrl}
            urlValue={draftBranding.faviconUrl}
          />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {BRANDING_TEXT_KEYS.map((key) => (
            <label className="grid gap-2 text-sm" key={key}>
              <span className="font-medium text-foreground">{TEXT_FIELD_LABELS[key]}</span>
              {key === "welcomeSubtitle" ||
              key === "portalTagline" ||
              key === "employeePortalMessage" ? (
                <textarea
                  className="min-h-24 w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  onChange={(event) => handleTextChange(key, event.target.value)}
                  value={draftBranding[key]}
                />
              ) : (
                <input
                  className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  onChange={(event) => handleTextChange(key, event.target.value)}
                  value={draftBranding[key]}
                />
              )}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-foreground">Colors</h3>
        <p className="mt-2 text-sm text-muted">
          These six color tokens drive branded UI surfaces.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {BRANDING_COLOR_KEYS.map((key) => (
            <ColorPickerField
              key={key}
              description={COLOR_FIELD_DESCRIPTIONS[key]}
              label={COLOR_FIELD_LABELS[key]}
              onChange={(nextValue) => handleColorChange(key, nextValue)}
              value={draftBranding[key]}
            />
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-foreground">Typography</h3>
        <p className="mt-2 text-sm text-muted">
          Select one font family for the entire web app shell.
        </p>
        <label className="mt-5 grid gap-2 text-sm">
          <span className="font-medium text-foreground">Font family</span>
          <select
            className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) =>
              setDraftBranding((current) => ({
                ...current,
                fontFamily: event.target.value as BrandingSettings["fontFamily"],
              }))
            }
            value={draftBranding.fontFamily}
          >
            {BRANDING_FONT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-2xl font-semibold text-foreground">Live preview</h3>
        <p className="mt-2 text-sm text-muted">
          Preview updates instantly from your draft before saving.
        </p>

        <div
          className="dp-theme-scope mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"
          style={previewStyle}
        >
          <article className="rounded-2xl border border-border bg-[color-mix(in_oklab,var(--dp-surface)_90%,white)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Sidebar preview
            </p>
            <div className="mt-3 flex items-center gap-3">
              {previewLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Preview logo"
                  className="h-10 w-10 rounded-xl border border-border bg-white object-contain"
                  src={previewLogoUrl}
                />
              ) : (
                <div className="h-10 w-10 rounded-xl border border-dashed border-border bg-white" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {draftBranding.brandName}
                </p>
                <p className="truncate text-xs text-muted">{draftBranding.portalTagline}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <div className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white">
                Dashboard
              </div>
              <div className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground">
                Employees
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-border bg-[var(--dp-background)] p-4">
            <div className="rounded-xl border border-border bg-[var(--dp-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Dashboard card
              </p>
              <h4 className="mt-2 text-xl font-semibold text-foreground">
                {draftBranding.dashboardGreeting}
              </h4>
              <p className="mt-2 text-sm text-muted">{draftBranding.employeePortalMessage}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: "var(--dp-primary)" }}
                  type="button"
                >
                  Primary action
                </button>
                <button
                  className="rounded-xl border px-4 py-2 text-sm font-medium"
                  style={{
                    borderColor: "color-mix(in oklab, var(--dp-text) 20%, white)",
                    color: "var(--dp-text)",
                  }}
                  type="button"
                >
                  Secondary action
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-[var(--dp-surface)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Employees list preview
              </p>
              <div className="mt-2 rounded-lg border border-border bg-white px-3 py-2">
                <p className="text-sm font-semibold text-foreground">Fatima Ahmed</p>
                <p className="text-xs text-muted">Engineering • Active</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-white px-3 py-2 text-xs text-muted">
              Browser title: <span className="font-medium text-foreground">{draftBranding.appTitle}</span>
              <br />
              Favicon: {previewFaviconUrl ? "Configured" : "Default"}
            </div>
          </article>
        </div>
      </section>

      <ConfirmationDialog
        confirmLabel="Reset to defaults"
        description="This will overwrite saved branding values with default values."
        isLoading={isSaving}
        isOpen={showResetDialog}
        onCancel={() => setShowResetDialog(false)}
        onConfirm={handleResetToDefaults}
        title="Reset branding to defaults?"
        variant="warning"
      />

      <SideToast
        description={toast?.description}
        isOpen={Boolean(toast)}
        onClose={() => setToast(null)}
        placement="top-right"
        title={toast?.title ?? ""}
        variant={toast?.variant ?? "info"}
      />

      <div className="fixed bottom-4 right-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-lg">
        <button
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving || !isDirty}
          onClick={handleRevertDraft}
          type="button"
        >
          Cancel changes
        </button>
        <button
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          onClick={() => setShowResetDialog(true)}
          type="button"
        >
          Reset to defaults
        </button>
        <button
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSaving || !isDirty}
          onClick={handleSave}
          type="button"
        >
          {isSaving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function AssetField({
  accept,
  fileLabel,
  label,
  onFileSelect,
  onUrlChange,
  previewAlt,
  previewUrl,
  urlValue,
}: {
  accept: string;
  fileLabel?: string;
  label: string;
  onFileSelect: (file: File | null) => void;
  onUrlChange: (value: string) => void;
  previewAlt: string;
  previewUrl: string;
  urlValue: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-3 flex items-center gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={previewAlt}
            className="h-12 w-16 rounded-lg border border-border bg-surface object-contain"
            src={previewUrl}
          />
        ) : (
          <div className="flex h-12 w-16 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted">
            None
          </div>
        )}
        <label className="inline-flex cursor-pointer items-center rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:text-accent">
          Upload
          <input
            accept={accept}
            className="hidden"
            onChange={(event) => onFileSelect(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
      </div>
      {fileLabel ? <p className="mt-2 text-xs text-muted">Selected: {fileLabel}</p> : null}
      <label className="mt-3 grid gap-1 text-xs text-muted">
        Asset URL
        <input
          className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          onChange={(event) => onUrlChange(event.target.value)}
          placeholder="https://..."
          value={urlValue}
        />
      </label>
    </div>
  );
}

async function uploadBrandingAsset(settingKey: "logoUrl" | "faviconUrl", file: File) {
  const payload = new FormData();
  payload.set("settingKey", settingKey);
  payload.set("file", file);

  const response = await fetch("/api/tenant-settings/branding-assets", {
    method: "POST",
    body: payload,
  });

  const body = (await response.json().catch(() => null)) as
    | { message?: string; value?: string }
    | null;

  if (!response.ok || !body?.value) {
    throw new Error(
      body?.message ?? `Could not upload ${settingKey === "logoUrl" ? "logo" : "favicon"}.`,
    );
  }

  return body.value;
}
