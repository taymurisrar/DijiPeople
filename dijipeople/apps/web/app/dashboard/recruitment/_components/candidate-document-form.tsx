"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type CandidateDocumentFormProps = {
  candidateId: string;
};

export function CandidateDocumentForm({ candidateId }: CandidateDocumentFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "Resume",
    kind: "resume",
    fileName: "",
    contentType: "application/pdf",
    fileSizeBytes: "",
    storageKey: "",
    isPrimaryResume: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.fileName.trim()) {
      setError("File name is required.");
      return;
    }

    setIsSubmitting(true);

    const response = await fetch(`/api/candidates/${candidateId}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: form.name,
        kind: form.kind,
        fileName: form.fileName,
        contentType: form.contentType || undefined,
        fileSizeBytes: form.fileSizeBytes ? Number(form.fileSizeBytes) : undefined,
        storageKey: form.storageKey || undefined,
        isPrimaryResume: form.isPrimaryResume,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to register resume metadata.");
      setIsSubmitting(false);
      return;
    }

    router.refresh();
    setForm((current) => ({
      ...current,
      fileName: "",
      storageKey: "",
      fileSizeBytes: "",
    }));
    setIsSubmitting(false);
  }

  return (
    <form className="grid gap-4 rounded-[24px] border border-border bg-surface p-6 shadow-sm md:grid-cols-2" onSubmit={handleSubmit}>
      <Field label="Document name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
      <Field label="Kind" value={form.kind} onChange={(value) => setForm((current) => ({ ...current, kind: value }))} />
      <Field label="File name" value={form.fileName} onChange={(value) => setForm((current) => ({ ...current, fileName: value }))} />
      <Field label="Content type" value={form.contentType} onChange={(value) => setForm((current) => ({ ...current, contentType: value }))} />
      <Field label="File size bytes" value={form.fileSizeBytes} onChange={(value) => setForm((current) => ({ ...current, fileSizeBytes: value }))} />
      <Field label="Storage key" value={form.storageKey} onChange={(value) => setForm((current) => ({ ...current, storageKey: value }))} />
      <label className="flex items-center gap-3 text-sm md:col-span-2">
        <input
          checked={form.isPrimaryResume}
          className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
          onChange={(event) => setForm((current) => ({ ...current, isPrimaryResume: event.target.checked }))}
          type="checkbox"
        />
        <span className="font-medium text-foreground">Set as primary resume</span>
      </label>
      {error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger md:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="md:col-span-2">
        <button
          className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-70"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Register resume metadata"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium text-foreground">{label}</span>
      <input
        className="w-full rounded-2xl border border-border bg-white px-4 py-3 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
