"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GenericDocumentRecord } from "./types";

type DocumentListProps = {
  documents: GenericDocumentRecord[];
  emptyMessage?: string;
  deleteUrlBuilder?: (documentId: string) => string;
};

export function DocumentList({
  documents,
  emptyMessage = "No documents uploaded yet.",
  deleteUrlBuilder = (documentId) => `/api/documents/${documentId}`,
}: DocumentListProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(documentId: string) {
    setDeletingId(documentId);
    await fetch(deleteUrlBuilder(documentId), {
      method: "DELETE",
    });
    router.refresh();
    setDeletingId(null);
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-surface p-6 text-sm text-muted shadow-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-strong text-left text-muted">
            <tr>
              <th className="px-5 py-4 font-medium">Document</th>
              <th className="px-5 py-4 font-medium">Type</th>
              <th className="px-5 py-4 font-medium">Category</th>
              <th className="px-5 py-4 font-medium">Uploaded</th>
              <th className="px-5 py-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-white/90">
            {documents.map((document) => (
              <tr key={document.id}>
                <td className="px-5 py-4 align-top">
                  <p className="font-semibold text-foreground">
                    {document.title || document.originalFileName}
                  </p>
                  <p className="mt-1 text-muted">{document.originalFileName}</p>
                  <p className="mt-1 text-xs text-muted">
                    {[document.mimeType || "Unknown type", formatBytes(document.sizeInBytes)]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                  {document.description ? (
                    <p className="mt-2 max-w-sm text-xs text-muted">
                      {document.description}
                    </p>
                  ) : null}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {document.documentType?.name || "Not classified"}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  {document.documentCategory?.name || "Not categorized"}
                </td>
                <td className="px-5 py-4 align-top text-muted">
                  <p>{new Date(document.createdAt).toLocaleDateString()}</p>
                  <p className="mt-1 text-xs text-muted">
                    {document.uploadedByUser?.fullName || "System"}
                  </p>
                </td>
                <td className="px-5 py-4 align-top">
                  <div className="flex flex-wrap gap-3">
                    <a
                      className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                      href={document.viewPath}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View
                    </a>
                    <a
                      className="rounded-2xl border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/30 hover:text-accent"
                      href={document.downloadPath}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download
                    </a>
                    <button
                      className="rounded-2xl border border-danger/20 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/5 disabled:opacity-70"
                      disabled={deletingId === document.id}
                      onClick={() => handleDelete(document.id)}
                      type="button"
                    >
                      {deletingId === document.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatBytes(value?: number | null) {
  if (value === null || value === undefined) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
