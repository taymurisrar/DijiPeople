"use client";

import { useState } from "react";

/**
 * Author and publish the platform's legal documents.
 *
 * ## Why this screen exists
 *
 * The only way to change a word of the Terms of Service used to be editing
 * `services/api/prisma/seed-legal.ts` — ten documents held as TypeScript
 * template literals — and shipping a deploy. Whoever holds lawyer-approved copy
 * is rarely whoever can run a deploy, so the copy stayed as engineering-written
 * drafts, unpublished, and every purchase recorded no consent.
 *
 * ## The two rules this screen makes visible rather than enforcing itself
 *
 * Both belong to the API and are re-stated here only so an operator is not
 * surprised:
 *
 * 1. **A published version cannot be edited.** It is the evidence behind every
 *    acknowledgement naming it, so editing it would rewrite what people are
 *    recorded as having agreed to. A correction is a new draft.
 * 2. **Publication refuses text that says it is not ready** — an unfilled
 *    `{{PLACEHOLDER}}`, or wording that calls itself an unreviewed draft. That
 *    guard exists because ten such documents were once published to production.
 *    `publishBlockers` is that same answer, shown *before* the click.
 */

type LegalVersionSummary = {
  id: string;
  version: number;
  status: string;
  changeSummary: string | null;
  effectiveFrom: string;
  publishedAt: string | null;
};

export type LegalDocumentSummary = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  versions: LegalVersionSummary[];
  publishedVersion: LegalVersionSummary | null;
  draftVersion: LegalVersionSummary | null;
};

type LoadedVersion = {
  id: string;
  version: number;
  status: string;
  contentMarkdown: string;
  changeSummary: string | null;
  publishBlockers: string[];
};

async function call(path: string, init?: RequestInit) {
  const response = await fetch(`/api/super-admin/legal${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (body as { message?: string }).message ??
        `Request failed with ${response.status}`,
    );
  }
  return body;
}

export function LegalDocumentEditor({
  documents: initialDocuments,
}: {
  documents: LegalDocumentSummary[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedVersion | null>(null);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = documents.find((d) => d.slug === selectedSlug) ?? null;

  async function refreshList() {
    const next = (await call("/documents")) as LegalDocumentSummary[];
    setDocuments(next);
    return next;
  }

  async function openDocument(document: LegalDocumentSummary) {
    setSelectedSlug(document.slug);
    setError(null);
    setNotice(null);
    setLoaded(null);

    // Prefer the draft — it is what an operator can act on. With none, show the
    // published text read-only so they can see what is in force before starting
    // a correction.
    const versionId = document.draftVersion?.id ?? document.publishedVersion?.id;
    if (!versionId) {
      setDraftText("");
      return;
    }

    setBusy("loading");
    try {
      const version = (await call(`/versions/${versionId}`)) as LoadedVersion;
      setLoaded(version);
      setDraftText(version.contentMarkdown);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load it.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    if (!loaded) return;
    setBusy("saving");
    setError(null);
    setNotice(null);
    try {
      const updated = (await call(`/versions/${loaded.id}`, {
        method: "PATCH",
        body: JSON.stringify({ contentMarkdown: draftText }),
      })) as LoadedVersion;
      setLoaded(updated);
      setNotice("Draft saved.");
      await refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function startCorrection() {
    if (!selected) return;
    setBusy("drafting");
    setError(null);
    try {
      await call(`/documents/${selected.id}/drafts`, {
        method: "POST",
        body: JSON.stringify({
          contentMarkdown: draftText,
          changeSummary: "Correction",
        }),
      });
      const next = await refreshList();
      const refreshed = next.find((d) => d.slug === selected.slug);
      if (refreshed) await openDocument(refreshed);
      setNotice("New draft created. Edit and publish it as a new version.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start a draft.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!loaded) return;
    setBusy("publishing");
    setError(null);
    setNotice(null);
    try {
      await call(`/versions/${loaded.id}/publish`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const next = await refreshList();
      const refreshed = next.find((d) => d.slug === selectedSlug);
      if (refreshed) await openDocument(refreshed);
      setNotice("Published. It is now served publicly and can be accepted at checkout.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish.");
    } finally {
      setBusy(null);
    }
  }

  const isDraft = loaded?.status === "DRAFT";
  const dirty = loaded ? draftText !== loaded.contentMarkdown : false;
  const blockers = loaded?.publishBlockers ?? [];
  const publishedCount = documents.filter((d) => d.publishedVersion).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {publishedCount} of {documents.length} documents are published.
        {publishedCount === 0
          ? " Until at least the terms and privacy policy are published, a purchase records no consent."
          : ""}
      </p>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <ul className="space-y-1">
          {documents.map((document) => {
            const active = document.slug === selectedSlug;
            return (
              <li key={document.id}>
                <button
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    active ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onClick={() => void openDocument(document)}
                  type="button"
                >
                  <span className="block font-medium">{document.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {document.publishedVersion
                      ? `Published v${document.publishedVersion.version}`
                      : "Not published"}
                    {document.draftVersion
                      ? ` · draft v${document.draftVersion.version}`
                      : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="space-y-3">
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              Choose a document to read or edit it.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{selected.title}</h3>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  /legal/{selected.slug}
                </code>
                {loaded ? (
                  <span className="text-xs text-muted-foreground">
                    v{loaded.version} · {loaded.status}
                  </span>
                ) : null}
              </div>

              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
                  {notice}
                </p>
              ) : null}

              {/*
                The blockers are the whole point of showing this here: an
                operator who is refused on click has to guess, and guessing at a
                publication guard is how people end up editing the database.
              */}
              {isDraft && blockers.length > 0 ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p className="font-medium">Not publishable yet:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <textarea
                aria-label={`${selected.title} markdown`}
                className="h-[420px] w-full rounded-lg border border-border p-3 font-mono text-xs"
                disabled={!isDraft || busy !== null}
                onChange={(event) => setDraftText(event.target.value)}
                value={draftText}
              />

              <div className="flex flex-wrap gap-2">
                {isDraft ? (
                  <>
                    <button
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                      disabled={busy !== null || !dirty}
                      onClick={() => void saveDraft()}
                      type="button"
                    >
                      {busy === "saving" ? "Saving…" : "Save draft"}
                    </button>
                    <button
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
                      disabled={busy !== null || dirty || blockers.length > 0}
                      onClick={() => void publish()}
                      title={
                        dirty
                          ? "Save the draft first."
                          : blockers.length
                            ? "Resolve the blockers above first."
                            : "Publish this version"
                      }
                      type="button"
                    >
                      {busy === "publishing" ? "Publishing…" : "Publish"}
                    </button>
                  </>
                ) : (
                  <button
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => void startCorrection()}
                    title="A published version is immutable — a correction is a new version."
                    type="button"
                  >
                    {busy === "drafting" ? "Creating…" : "Start a new draft from this text"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
