"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
type Template = {
  id: string;
  name: string;
  contractType: string;
  versions: Array<{ title: string }>;
};
const modes = [
  ["blank", "Blank"],
  ["template", "From template"],
  ["source", "From record"],
  ["copy", "Copy contract"],
  ["upload", "Upload document"],
];
export function ContractCreationLauncher({
  mode,
  templates,
}: {
  mode: string;
  templates: Template[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function select(value: string) {
    router.push(`/contracts/new?mode=${value}`, { scroll: false });
  }
  function jsonSubmit(path: string, body: Record<string, unknown>) {
    startTransition(async () => {
      setMessage(null);
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(
          Array.isArray(payload?.message)
            ? payload.message.join(", ")
            : (payload?.message ?? "Unable to create contract."),
        );
        return;
      }
      router.push(`/contracts/${payload.id ?? payload.item?.id}`);
      router.refresh();
    });
  }
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--admin-primary)]">
            Contract source
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">
            Create an agreement
          </h1>
        </div>
        <div
          className="inline-flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="group"
        >
          {modes.map(([key, label]) => (
            <button
              key={key}
              onClick={() => select(key)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${mode === key ? "bg-white text-[var(--admin-primary)] shadow-sm" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === "template" ? (
        <div className="mt-4">
          <label className="grid max-w-xl gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Published template
            <select
              onChange={(e) =>
                router.push(
                  `/contracts/new?mode=template&templateId=${e.target.value}`,
                  { scroll: false },
                )
              }
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
            >
              <option value="">Select a template</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {label(item.contractType)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      {mode === "source" ? (
        <SourceForm
          disabled={pending}
          templates={templates}
          initialSourceType={searchParams.get("sourceType") ?? "customer"}
          initialSourceId={searchParams.get("sourceId") ?? ""}
          onSubmit={(body) => jsonSubmit("/api/contracts/from-source", body)}
        />
      ) : null}
      {mode === "copy" ? (
        <CopyForm
          disabled={pending}
          onSubmit={(body) => jsonSubmit("/api/contracts/copy", body)}
        />
      ) : null}
      {mode === "upload" ? (
        <UploadForm
          disabled={pending}
          onMessage={setMessage}
          onCreated={(id) => router.push(`/contracts/${id}`)}
        />
      ) : null}
      {message ? (
        <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}
function SourceForm({
  disabled,
  templates,
  initialSourceType,
  initialSourceId,
  onSubmit,
}: {
  disabled: boolean;
  templates: Template[];
  initialSourceType: string;
  initialSourceId: string;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        onSubmit({
          sourceType: d.get("sourceType"),
          sourceId: d.get("sourceId"),
          templateId: d.get("templateId") || undefined,
          title: d.get("title") || undefined,
          contractType: "CUSTOMER_AGREEMENT",
        });
      }}
    >
      <Select
        name="sourceType"
        label="Source type"
        options={["lead", "customer", "onboarding", "tenant"]}
        defaultValue={initialSourceType}
      />
      <Input
        name="sourceId"
        label="Record ID"
        required
        defaultValue={initialSourceId}
      />
      <Input name="title" label="Contract title" />
      <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Template
        <select
          name="templateId"
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
        >
          <option value="">Default / blank</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={disabled}
        className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white md:col-start-2 lg:col-start-4"
      >
        Create from record
      </button>
    </form>
  );
}
function CopyForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        onSubmit(Object.fromEntries(d));
      }}
    >
      <Input name="sourceContractId" label="Source contract ID" required />
      <Input name="title" label="New contract title" required />
      <Input name="counterpartyName" label="Counterparty override" />
      <Input name="counterpartyEmail" label="Counterparty email" type="email" />
      <button
        disabled={disabled}
        className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white md:col-start-2"
      >
        Create copy
      </button>
    </form>
  );
}
function UploadForm({
  disabled,
  onMessage,
  onCreated,
}: {
  disabled: boolean;
  onMessage: (v: string) => void;
  onCreated: (id: string) => void;
}) {
  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        onMessage("");
        const response = await fetch("/api/contracts/upload", {
          method: "POST",
          body: new FormData(e.currentTarget),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          onMessage(payload?.message ?? "Unable to upload contract.");
          return;
        }
        onCreated(payload.id);
      }}
    >
      <Input name="title" label="Contract title" required />
      <Select
        name="contractType"
        label="Contract type"
        options={[
          "PARTNER_AGREEMENT",
          "CUSTOMER_AGREEMENT",
          "NDA",
          "SERVICE_AGREEMENT",
          "ADDENDUM",
          "OTHER",
        ]}
      />
      <Input name="counterpartyName" label="Counterparty" required />
      <Input name="counterpartyEmail" label="Counterparty email" type="email" />
      <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:col-span-2">
        Document
        <input
          name="file"
          required
          type="file"
          accept=".docx,.pdf,.txt,.html"
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal"
        />
      </label>
      <button
        disabled={disabled}
        className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white lg:col-start-3"
      >
        Import and create
      </button>
    </form>
  );
}
function Input({
  name,
  label: caption,
  required = false,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {caption}
      <input
        name={name}
        required={required}
        type={type}
        defaultValue={defaultValue}
        className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
      />
    </label>
  );
}
function Select({
  name,
  label: caption,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {caption}
      <select
        name={name}
        defaultValue={defaultValue}
        className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {label(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
function label(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
