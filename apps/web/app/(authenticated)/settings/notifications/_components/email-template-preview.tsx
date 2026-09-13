"use client";

import { useState } from "react";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import type { RenderedTemplate } from "@/lib/notifications-api";
import { ErrorBanner, SettingsPanel } from "./notification-ui";

/*
 * ITEM-0181. The rendered email as the API produces it — subject, formatted
 * body and plain-text part — with the catalog's sample values filled in.
 *
 * The body is shown in a sandboxed iframe with no permissions at all: the HTML
 * is already sanitised server-side, and the sandbox means even a sanitiser gap
 * could not run script or navigate this page.
 */
export function EmailTemplatePreview({
  error,
  loading,
  rendered,
  unknownVariables = [],
}: {
  error: string | null;
  loading: boolean;
  rendered: RenderedTemplate | null;
  unknownVariables?: readonly string[];
}) {
  const [view, setView] = useState<"html" | "text">("html");

  return (
    <SettingsPanel title="Preview">
      <div className="grid gap-4" aria-busy={loading}>
        <ErrorBanner message={error} />
        {unknownVariables.length ? (
          <ErrorBanner
            message={`Not supplied by this event: ${unknownVariables.join(", ")}`}
          />
        ) : null}

        {rendered ? (
          <>
            <div className="rounded-2xl border border-border bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Subject
              </div>
              <div className="mt-1 break-words text-sm font-semibold text-foreground">
                {rendered.renderedSubject}
              </div>
            </div>
            <SegmentedControl
              label="Format"
              onChange={setView}
              options={[
                { label: "Formatted", value: "html" },
                { label: "Plain text", value: "text" },
              ]}
              value={view}
            />
            {view === "html" ? (
              <iframe
                className="h-[480px] w-full rounded-2xl border border-border bg-white"
                sandbox=""
                srcDoc={rendered.renderedHtml}
                title="Email preview"
              />
            ) : (
              <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-white p-4 font-sans text-sm text-foreground">
                {rendered.renderedText ?? ""}
              </pre>
            )}
          </>
        ) : !error ? (
          <p className="text-sm text-muted" role="status">
            {loading ? "Rendering preview…" : "Nothing to preview yet."}
          </p>
        ) : null}
      </div>
    </SettingsPanel>
  );
}
