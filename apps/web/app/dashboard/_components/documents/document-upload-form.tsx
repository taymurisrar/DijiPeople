"use client";

import { ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SharedLookupOption } from "./types";
import { LookupField, TextField, TextAreaField } from "@/app/components/ui/form-control"

type DocumentUploadFormProps = {
  entityType: string;
  entityId: string;
  documentTypes: SharedLookupOption[];
  documentCategories: SharedLookupOption[];
  uploadUrl?: string;
  accept?: string;
  submitLabel?: string;
  includeEntityFields?: boolean;
};

export function DocumentUploadForm({
  entityType,
  entityId,
  documentTypes,
  documentCategories,
  uploadUrl = "/api/documents/upload",
  accept = ".pdf,.doc,.docx,.png,.jpg,.jpeg",
  submitLabel = "Upload document",
  includeEntityFields = true,
}: DocumentUploadFormProps) {
  const router = useRouter();
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [documentCategoryId, setDocumentCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!documentTypeId) {
      setError("Select a document type before uploading.");
      event.target.value = "";
      return;
    }

    setError(null);
    setIsUploading(true);

    const formData = new FormData();
    formData.set("file", file);
    if (includeEntityFields) {
      formData.set("entityType", entityType);
      formData.set("entityId", entityId);
    }
    formData.set("documentTypeId", documentTypeId);

    if (documentCategoryId) {
      formData.set("documentCategoryId", documentCategoryId);
    }

    if (title.trim()) {
      formData.set("title", title.trim());
    }

    if (description.trim()) {
      formData.set("description", description.trim());
    }

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });
    const data = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    if (!response.ok) {
      setError(data?.message ?? "Unable to upload document.");
      setIsUploading(false);
      return;
    }

    event.target.value = "";
    setDocumentTypeId("");
    setDocumentCategoryId("");
    setTitle("");
    setDescription("");
    setIsUploading(false);
    router.refresh();
  }

  return (
    <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5">
        <h4 className="text-lg font-semibold text-foreground">{submitLabel}</h4>
        <p className="mt-2 text-sm text-muted">
          Keep files searchable by classifying them with a type and category.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <LookupField
          label="Document type"
          options={documentTypes}
          placeholder="Select document type"
          value={documentTypeId}
          onChange={setDocumentTypeId}
        />
        <LookupField
          label="Document category"
          options={documentCategories}
          placeholder="Select document category"
          value={documentCategoryId}
          onChange={setDocumentCategoryId}
        />
        <TextField label="Title" value={title} onChange={setTitle} />
        <TextAreaField
          label="Description"
          value={description}
          onChange={setDescription}
        />
      </div>

      <div className="mt-5 flex items-end">
        <label className="w-full cursor-pointer rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-strong">
          {isUploading ? "Uploading..." : submitLabel}
          <input
            accept={accept}
            className="hidden"
            disabled={isUploading}
            onChange={handleFileChange}
            type="file"
          />
        </label>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
