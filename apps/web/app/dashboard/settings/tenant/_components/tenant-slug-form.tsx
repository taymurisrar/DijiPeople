"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmationDialog, SideToast } from "@/app/components/notifications";
import { buildTenantLoginUrl } from "@/lib/tenant-url";

type TenantSlugFormProps = {
  canEdit: boolean;
  initialSlug: string;
};

type ApiErrorResponse = {
  message?: string;
  error?: string;
};

export function TenantSlugForm({ canEdit, initialSlug }: TenantSlugFormProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const [savedSlug, setSavedSlug] = useState(initialSlug);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    title: string;
    description?: string;
    variant: "success" | "error";
  } | null>(null);
  const isDirty = slug.trim() !== savedSlug;
  const normalizedSlug = slug.trim().toLowerCase();
  const loginUrl = buildTenantLoginUrl(savedSlug || normalizedSlug);
  const nextLoginUrl = buildTenantLoginUrl(normalizedSlug);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit || !isDirty || isSaving) {
      return;
    }

    const validationError = validateSlug(normalizedSlug);
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    setFieldError(null);
    setConfirmOpen(true);
  }

  async function saveSlug() {
    setIsSaving(true);
    setConfirmOpen(false);

    try {
      const response = await fetch("/api/tenants/current/slug", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: normalizedSlug }),
      });
      const data = (await response.json().catch(() => null)) as
        | ApiErrorResponse
        | { slug?: string }
        | null;

      if (!response.ok) {
        setToast({
          title: "Slug save failed",
          description: getApiErrorMessage(data),
          variant: "error",
        });
        return;
      }

      const nextSlug =
        data && "slug" in data && typeof data.slug === "string"
          ? data.slug
          : normalizedSlug;

      setSlug(nextSlug);
      setSavedSlug(nextSlug);
      setToast({
        title: "Tenant slug saved",
        description: `New login URL: ${buildTenantLoginUrl(nextSlug)}`,
        variant: "success",
      });
      router.refresh();
    } catch {
      setToast({
        title: "Slug save failed",
        description: "Unable to update the tenant slug right now.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-[minmax(0,1fr)_auto]"
      onSubmit={handleSubmit}
    >
      <label className="grid gap-2 text-sm">
        <span className="font-medium text-foreground">Tenant slug</span>
        <input
          aria-describedby="tenant-slug-help tenant-slug-error"
          aria-invalid={Boolean(fieldError)}
          className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted"
          disabled={!canEdit || isSaving}
          maxLength={63}
          minLength={3}
          onChange={(event) => {
            setSlug(event.target.value.toLowerCase());
            setFieldError(null);
          }}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          value={slug}
        />
        <span id="tenant-slug-help" className="text-xs leading-5 text-muted">
          {canEdit
            ? "Used for tenant-specific URLs and tenant identity. Changing it may affect tenant access links."
            : "Only System Customizer can edit this value."}
        </span>
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white/70 px-3 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="break-all">Login URL: {loginUrl}</span>
          <button
            className="rounded-xl border border-border px-3 py-2 font-semibold text-foreground transition hover:border-accent/30 hover:text-accent"
            onClick={async () => {
              await navigator.clipboard.writeText(loginUrl);
              setToast({
                title: "Login URL copied",
                variant: "success",
              });
            }}
            type="button"
          >
            Copy
          </button>
        </div>
        {fieldError ? (
          <span id="tenant-slug-error" className="text-xs text-danger">
            {fieldError}
          </span>
        ) : null}
        {canEdit && isDirty ? (
          <span className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
            Review this change before saving. Existing tenant login links that
            use <strong>{savedSlug}</strong> will need to use{" "}
            <strong>{normalizedSlug}</strong> after the update.
          </span>
        ) : null}
      </label>

      <div className="flex items-end">
        <button
          className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canEdit || !isDirty || isSaving}
          type="submit"
        >
          {isSaving ? "Saving..." : "Save slug"}
        </button>
      </div>

      {toast ? (
        <SideToast
          isOpen
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      ) : null}

      <ConfirmationDialog
        cancelLabel="Cancel"
        confirmLabel="Update slug"
        description={`This changes the tenant login URL from ${loginUrl} to ${nextLoginUrl}. Active sessions remain valid, but shared login links must use the new slug.`}
        isLoading={isSaving}
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={saveSlug}
        title="Change tenant slug?"
        variant="warning"
      />
    </form>
  );
}

function getApiErrorMessage(data: ApiErrorResponse | { slug?: string } | null) {
  if (data && "message" in data && typeof data.message === "string") {
    return data.message;
  }

  if (data && "error" in data && typeof data.error === "string") {
    return data.error;
  }

  return "Unable to update the tenant slug.";
}

function validateSlug(slug: string) {
  if (slug.length < 3) {
    return "Slug must be at least 3 characters.";
  }

  if (slug.length > 63) {
    return "Slug must be 63 characters or fewer.";
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "Use lowercase letters, numbers, and single hyphens only. Slug cannot start or end with a hyphen.";
  }

  return null;
}
