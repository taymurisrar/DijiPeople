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

type PreviousPublished = {
  version: number;
  contentMarkdown: string;
  publishedAt: string | null;
} | null;

type LoadedVersion = {
  id: string;
  version: number;
  status: string;
  contentMarkdown: string;
  changeSummary: string | null;
  publishBlockers: string[];
  previousPublished: PreviousPublished;
};

type DiffLine = { type: "same" | "add" | "remove"; text: string };

/*
 * ITEM-0068 — the diff itself. A plain LCS line diff, not a dependency: legal
 * documents are markdown text a few hundred lines long at most, so an O(n*m)
 * table is cheap, and pulling in a diff package for one screen is not
 * justified when this is ~30 lines. `MAX_DIFF_CELLS` is the honest bailout —
 * if a document is ever large enough to make the table itself expensive, the
 * screen says so and falls back to showing both full texts rather than
 * hanging the tab.
 */
const MAX_DIFF_CELLS = 4_000_000;

function diffLines(oldText: string, newText: string): DiffLine[] | null {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  if (a.length * b.length > MAX_DIFF_CELLS) return null;

  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i += 1) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", text: a[i] });
      i += 1;
    } else {
      result.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    result.push({ type: "remove", text: a[i] });
    i += 1;
  }
  while (j < m) {
    result.push({ type: "add", text: b[j] });
    j += 1;
  }
  return result;
}

/** Collapse long unchanged runs so a 400-line policy with a one-line edit is
 * still readable. Keeps a few lines of context on each side of a change. */
function collapseContext(lines: DiffLine[], context = 3) {
  const out: Array<DiffLine | { type: "collapsed"; count: number }> = [];
  let run: DiffLine[] = [];

  const flush = (isBoundary: boolean) => {
    if (run.length <= context * 2 || !isBoundary) {
      out.push(...run);
    } else {
      out.push(...run.slice(0, context));
      out.push({ type: "collapsed", count: run.length - context * 2 });
      out.push(...run.slice(run.length - context));
    }
    run = [];
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    if (line.type === "same") {
      run.push(line);
    } else {
      flush(true);
      out.push(line);
    }
  }
  flush(false);
  return out;
}

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
  // ITEM-0068 — typing the document's slug is the acknowledgement gate for
  // Publish. It resets on every load and every save because a save changes
  // what would actually go live; a confirmation typed against a since-edited
  // text would be confirming something the operator never saw.
  const [confirmSlug, setConfirmSlug] = useState("");

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
    setConfirmSlug("");

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
      setConfirmSlug("");
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
    if (!loaded || !selected) return;
    // Belt and braces alongside the disabled button: the acknowledgement is
    // the gate, not a decoration on it.
    if (confirmSlug.trim() !== selected.slug) return;
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

  // Diffed against the saved text, not the live textarea — while dirty, Publish
  // is already disabled, and by the time it is enabled draftText and
  // loaded.contentMarkdown are equal, so this is exactly what would go live.
  const previousPublished = loaded?.previousPublished ?? null;
  const rawDiff =
    isDraft && loaded && previousPublished
      ? diffLines(previousPublished.contentMarkdown, loaded.contentMarkdown)
      : null;
  const diffRows = rawDiff ? collapseContext(rawDiff) : null;
  const addedCount = rawDiff?.filter((l) => l.type === "add").length ?? 0;
  const removedCount = rawDiff?.filter((l) => l.type === "remove").length ?? 0;
  const hasChanges = addedCount > 0 || removedCount > 0;
  const confirmed = selected ? confirmSlug.trim() === selected.slug : false;

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

              {/*
                ITEM-0068 — the one thing the operator could not previously see:
                what this publish would actually change. Shown whenever there is
                a draft, not gated behind a click, because a publish that turns
                out to be reviewable only after the fact is not reviewable.
              */}
              {isDraft && !dirty ? (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {previousPublished ? (
                    <>
                      <p className="text-sm font-medium">
                        Changes since published v{previousPublished.version}
                        {hasChanges ? (
                          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                            <span className="text-emerald-700">+{addedCount}</span>{" "}
                            <span className="text-red-700">-{removedCount}</span>
                          </span>
                        ) : (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            no textual change
                          </span>
                        )}
                      </p>
                      {diffRows ? (
                        <pre className="max-h-72 overflow-auto rounded bg-muted p-2 font-mono text-xs leading-5">
                          {diffRows.map((row, index) =>
                            "count" in row ? (
                              <div key={`gap-${index}`} className="text-muted-foreground">
                                … {row.count} unchanged line{row.count === 1 ? "" : "s"} …
                              </div>
                            ) : (
                              <div
                                key={index}
                                className={
                                  row.type === "add"
                                    ? "bg-emerald-100 text-emerald-900"
                                    : row.type === "remove"
                                      ? "bg-red-100 text-red-900"
                                      : "text-muted-foreground"
                                }
                              >
                                {row.type === "add" ? "+ " : row.type === "remove" ? "- " : "  "}
                                {row.text || " "}
                              </div>
                            ),
                          )}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          This document is too long to diff line by line here. Read
                          both versions in full before publishing.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      First publication of this document — there is no earlier
                      published version to compare against. This text becomes
                      what visitors see and what checkout requires acceptance of.
                    </p>
                  )}

                  <label className="block pt-1 text-sm" htmlFor="legal-publish-confirm">
                    Type <code className="rounded bg-muted px-1 py-0.5">{selected.slug}</code>{" "}
                    to confirm you have reviewed the text above and it is ready
                    to publish.
                  </label>
                  <input
                    autoComplete="off"
                    className="w-full rounded-lg border border-border px-3 py-1.5 text-sm"
                    disabled={busy !== null || blockers.length > 0}
                    id="legal-publish-confirm"
                    onChange={(event) => setConfirmSlug(event.target.value)}
                    placeholder={selected.slug}
                    value={confirmSlug}
                  />
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
                      disabled={
                        busy !== null || dirty || blockers.length > 0 || !confirmed
                      }
                      onClick={() => void publish()}
                      title={
                        dirty
                          ? "Save the draft first."
                          : blockers.length
                            ? "Resolve the blockers above first."
                            : !confirmed
                              ? `Type "${selected.slug}" above to confirm.`
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
