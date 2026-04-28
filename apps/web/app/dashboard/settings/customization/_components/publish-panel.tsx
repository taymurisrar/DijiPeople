"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Rocket, RotateCcw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { PermissionGate } from "@/app/dashboard/_components/permission-gate";
import type {
  CustomizationPublishHistoryItem,
  CustomizationPublishValidationError,
} from "../types";

type PublishPanelProps = {
  history: CustomizationPublishHistoryItem[];
};

type PublishResponse = {
  version?: number;
  publishedAt?: string;
  message?: string;
  errors?: CustomizationPublishValidationError[];
};

export function PublishPanel({ history }: PublishPanelProps) {
  const router = useRouter();
  const [isPublishing, setIsPublishing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    CustomizationPublishValidationError[]
  >([]);
  const latest = history[0] ?? null;
  const groupedErrors = useMemo(
    () => groupValidationErrors(validationErrors),
    [validationErrors],
  );

  async function publish() {
    setIsPublishing(true);
    setSuccessMessage(null);
    setErrorMessage(null);
    setValidationErrors([]);

    try {
      const response = await fetch("/api/customization/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json().catch(() => ({}))) as PublishResponse;

      if (!response.ok) {
        setErrorMessage(payload.message ?? "Customization publish failed.");
        setValidationErrors(Array.isArray(payload.errors) ? payload.errors : []);
        return;
      }

      setSuccessMessage(
        payload.version
          ? `Published version ${payload.version}. Runtime pages will use this stable configuration.`
          : "Customizations published.",
      );
      router.refresh();
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <SectionCard
      description="Publish validates the draft metadata and promotes a stable snapshot for integrated runtime pages. Pages fall back to system defaults when no published snapshot exists."
      title="Publish Customizations"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="rounded-[22px] border border-border bg-white/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {latest
                  ? `Latest published version ${latest.version}`
                  : "No published version yet"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {latest?.publishedAt
                  ? `Published ${formatDateTime(latest.publishedAt)} by ${
                      latest.publishedByName ?? latest.publishedByEmail ?? "a customizer"
                    }.`
                  : "Draft table, column, view, and form changes are not used by runtime pages until they pass validation and are published."}
              </p>
            </div>
            <PermissionGate anyOf={["customization.publish"]}>
              <Button
                leftIcon={<Rocket className="h-4 w-4" />}
                loading={isPublishing}
                loadingText="Publishing"
                onClick={publish}
                type="button"
              >
                Publish
              </Button>
            </PermissionGate>
          </div>

          {successMessage ? (
            <div className="mt-4 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              {groupedErrors.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {groupedErrors.map((group) => (
                    <div key={group.key}>
                      <p className="font-semibold">{group.title}</p>
                      <ul className="mt-2 space-y-1">
                        {group.errors.map((error, index) => (
                          <li key={`${group.key}-${index}`}>
                            {error.entityKey ? `${error.entityKey}: ` : ""}
                            {error.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-[22px] border border-border bg-white/80 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Publish History
              </h3>
              <p className="mt-1 text-xs text-muted">
                Last {Math.min(history.length, 25)} published snapshots
              </p>
            </div>
            <Button
              leftIcon={<RotateCcw className="h-4 w-4" />}
              onClick={() => router.refresh()}
              size="sm"
              type="button"
              variant="secondary"
            >
              Refresh
            </Button>
          </div>
          {history.length === 0 ? (
            <EmptyState
              description="Publish history will appear here after the first successful customization publish."
              title="No published snapshots"
            />
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div
                  className="rounded-2xl border border-border bg-surface px-4 py-3"
                  key={item.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">
                      Version {item.version}
                    </p>
                    <StatusPill tone={item.status === "published" ? "good" : "muted"}>
                      {item.status}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {item.publishedAt ? formatDateTime(item.publishedAt) : "Not published"}
                    {item.publishedByName || item.publishedByEmail
                      ? ` by ${item.publishedByName ?? item.publishedByEmail}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function groupValidationErrors(errors: CustomizationPublishValidationError[]) {
  const grouped = new Map<string, CustomizationPublishValidationError[]>();
  for (const error of errors) {
    const key = `${error.scope}:${error.tableKey ?? "general"}`;
    grouped.set(key, [...(grouped.get(key) ?? []), error]);
  }

  return [...grouped.entries()].map(([key, items]) => {
    const [scope, tableKey] = key.split(":");
    return {
      key,
      title: `${capitalize(scope)}${tableKey ? `: ${tableKey}` : ""}`,
      errors: items,
    };
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
