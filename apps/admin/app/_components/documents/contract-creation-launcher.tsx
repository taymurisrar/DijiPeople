"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { RuntimeLookupOption } from "@/lib/runtime/runtime-lookups";
import {
  SIGNER_FIELD_LABELS,
  SIGNER_FIELD_LIMITS,
  describeContractApiError,
  requiredSignerFields,
  signerErrors,
  templateOptionState,
  type SignerField,
  type SourceEligibility,
} from "./contract-source-eligibility";
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
  const [messageFields, setMessageFields] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  function select(value: string) {
    router.push(`/contracts/new?mode=${value}`, { scroll: false });
  }
  function jsonSubmit(path: string, body: Record<string, unknown>) {
    startTransition(async () => {
      setMessage(null);
      setMessageFields([]);
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        // The API names each field it could not fill; list them rather than
        // leaving the operator to guess from one sentence.
        const error = describeContractApiError(
          payload,
          "Unable to create contract.",
        );
        setMessage(error.message);
        setMessageFields(error.fields);
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
          onMessage={(value) => {
            setMessage(value || null);
            setMessageFields([]);
          }}
          onCreated={(id) => router.push(`/contracts/${id}`)}
        />
      ) : null}
      {message ? (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          <p>{message}</p>
          {messageFields.length ? (
            <ul className="mt-2 list-disc pl-5">
              {messageFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
const sourceRecords = [
  {
    value: "lead",
    lookupPath: "/super-admin/leads?pageSize=100",
    recordPath: "/leads",
  },
  {
    value: "customer",
    lookupPath: "/super-admin/customers?pageSize=100",
    recordPath: "/customers",
  },
  {
    value: "onboarding",
    lookupPath: "/super-admin/customer-onboarding?pageSize=100",
    recordPath: "/onboarding",
  },
  {
    value: "tenant",
    lookupPath: "/super-admin/tenants",
    recordPath: "/tenants",
  },
];

function SourceForm({
  disabled,
  initialSourceType,
  initialSourceId,
  onSubmit,
}: {
  disabled: boolean;
  initialSourceType: string;
  initialSourceId: string;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [sourceType, setSourceType] = useState(
    sourceRecords.some((item) => item.value === initialSourceType)
      ? initialSourceType
      : "customer",
  );
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [templateId, setTemplateId] = useState("");
  const [signer, setSigner] = useState<Partial<Record<SignerField, string>>>(
    {},
  );
  const [showSignerErrors, setShowSignerErrors] = useState(false);
  const source =
    sourceRecords.find((item) => item.value === sourceType) ?? sourceRecords[1];
  const eligibility = useSourceEligibility(sourceType, sourceId);
  const chosen = eligibility.data?.items.find(
    (item) => item.templateId === templateId,
  );
  const chosenState = chosen ? templateOptionState(chosen) : null;
  const signerFields = requiredSignerFields(chosen);
  const errors = signerErrors(signerFields, signer);
  const hasSignerErrors = Object.keys(errors).length > 0;
  /*
   * Without a chosen record there is nothing to judge a template against, so
   * the picker waits for one rather than offering every template and letting
   * the API refuse the wrong pairing afterwards — which is what it used to do.
   */
  const templatesReady = Boolean(sourceId) && eligibility.status === "ready";

  return (
    <form
      className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (chosenState?.disabled) return;
        if (hasSignerErrors) {
          setShowSignerErrors(true);
          return;
        }
        const d = new FormData(e.currentTarget);
        onSubmit({
          sourceType,
          sourceId,
          templateId: templateId || undefined,
          title: d.get("title") || undefined,
          ...(signerFields.length
            ? {
                signer: Object.fromEntries(
                  signerFields.map((field) => [field, signer[field]?.trim()]),
                ),
              }
            : {}),
        });
      }}
    >
      <Select
        name="sourceType"
        label="Source type"
        options={sourceRecords.map((item) => item.value)}
        value={sourceType}
        onChange={(value) => {
          setSourceType(value);
          setSourceId("");
          setTemplateId("");
          setSigner({});
          setShowSignerErrors(false);
        }}
      />
      <LookupSelect
        key={source.value}
        name="sourceId"
        label="Record"
        path={source.lookupPath}
        required
        value={sourceId}
        initialValue={
          sourceId && sourceId === initialSourceId ? initialSourceId : undefined
        }
        onSelect={(option) => {
          setSourceId(option?.value ?? "");
          setTemplateId("");
          setSigner({});
          setShowSignerErrors(false);
        }}
        action={
          sourceId
            ? {
                href: `${source.recordPath}/${sourceId}`,
                label: "Open record",
              }
            : undefined
        }
      />
      <Input name="title" label="Contract title" />
      <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Template
        <select
          name="templateId"
          value={templateId}
          disabled={!templatesReady}
          aria-describedby="source-template-status"
          onChange={(event) => {
            setTemplateId(event.target.value);
            setShowSignerErrors(false);
          }}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal disabled:bg-slate-50"
        >
          <option value="">Default / blank</option>
          {(eligibility.data?.items ?? []).map((item) => {
            const state = templateOptionState(item);
            return (
              <option
                key={item.templateId}
                value={item.templateId}
                disabled={state.disabled}
                title={state.reason ?? undefined}
              >
                {state.label}
              </option>
            );
          })}
        </select>
        <span
          id="source-template-status"
          aria-live="polite"
          className={`text-[11px] font-normal normal-case tracking-normal ${eligibility.status === "error" ? "text-rose-600" : "text-slate-500"}`}
        >
          {!sourceId
            ? ""
            : eligibility.status === "loading"
              ? "Checking which templates this record can fill..."
              : eligibility.status === "error"
                ? eligibility.error
                : !eligibility.data?.items.length
                  ? "No published templates are available."
                  : (chosenState?.reason ?? "")}
        </span>
      </label>
      {signerFields.length ? (
        <fieldset className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 md:col-span-2 lg:col-span-4 md:grid-cols-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            Authorized signer
          </legend>
          {signerFields.map((field) => {
            const error = showSignerErrors ? errors[field] : undefined;
            const id = `source-signer-${field}`;
            return (
              <label
                key={field}
                htmlFor={id}
                className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                {SIGNER_FIELD_LABELS[field]}
                <input
                  id={id}
                  name={`signer.${field}`}
                  type={field === "email" ? "email" : "text"}
                  required
                  maxLength={SIGNER_FIELD_LIMITS[field]}
                  autoComplete="off"
                  value={signer[field] ?? ""}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) =>
                    setSigner((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal aria-[invalid=true]:border-rose-400"
                />
                {error ? (
                  <span
                    id={`${id}-error`}
                    className="text-[11px] font-normal normal-case tracking-normal text-rose-600"
                  >
                    {error}
                  </span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
      ) : null}
      <button
        disabled={
          disabled ||
          !sourceId ||
          (Boolean(sourceId) && eligibility.status === "loading") ||
          Boolean(chosenState?.disabled)
        }
        className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-40 md:col-start-2 lg:col-start-4"
      >
        Create from record
      </button>
    </form>
  );
}

type EligibilityState =
  | { status: "idle" | "loading"; data: null; error: null }
  | { status: "ready"; data: SourceEligibility; error: null }
  | { status: "error"; data: null; error: string };

/*
 * Asks the API which published templates the chosen record can fill. The API
 * runs the same rule `from-source` enforces, so a template shown as available
 * here is one creation will accept — barring a record edited in between, which
 * the creation call still catches and reports.
 */
function useSourceEligibility(
  sourceType: string,
  sourceId: string,
): EligibilityState {
  /*
   * The answer is stored with the record it answers for, and anything else
   * reads as loading. A late response for a record the operator has already
   * moved off can then never be shown against the new one.
   */
  const requestKey = sourceId ? `${sourceType}:${sourceId}` : "";
  const [result, setResult] = useState<
    | { key: string; data: SourceEligibility; error: null }
    | { key: string; data: null; error: string }
    | null
  >(null);
  useEffect(() => {
    if (!sourceId) return;
    const key = `${sourceType}:${sourceId}`;
    const controller = new AbortController();
    const query = new URLSearchParams({ sourceType, sourceId });
    fetch(`/api/contracts/template-eligibility?${query.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as unknown;
        if (!response.ok) {
          throw new Error(
            describeContractApiError(
              payload,
              "Unable to check which templates this record can fill.",
            ).message,
          );
        }
        setResult({ key, data: payload as SourceEligibility, error: null });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          return;
        setResult({
          key,
          data: null,
          error:
            reason instanceof Error
              ? reason.message
              : "Unable to check which templates this record can fill.",
        });
      });
    return () => controller.abort();
  }, [sourceType, sourceId]);
  if (!requestKey) return { status: "idle", data: null, error: null };
  if (!result || result.key !== requestKey)
    return { status: "loading", data: null, error: null };
  return result.data
    ? { status: "ready", data: result.data, error: null }
    : { status: "error", data: null, error: result.error ?? "" };
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
  const [contractType, setContractType] = useState("PARTNER_AGREEMENT");
  const [counterpartyName, setCounterpartyName] = useState("");
  const relationship = uploadRelationship(contractType);

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
        value={contractType}
        onChange={(value) => {
          setContractType(value);
          setCounterpartyName("");
        }}
        options={[
          "PARTNER_AGREEMENT",
          "CUSTOMER_AGREEMENT",
          "NDA",
          "SERVICE_AGREEMENT",
          "ADDENDUM",
          "OTHER",
        ]}
      />
      {relationship ? (
        <LookupSelect
          key={relationship.name}
          name={relationship.name}
          label={relationship.label}
          path={relationship.path}
          action={{
            href: relationship.createHref,
            label: relationship.createLabel,
          }}
          required
          onSelect={(option) => setCounterpartyName(option?.label ?? "")}
        />
      ) : (
        <Input
          name="counterpartyName"
          label="Counterparty"
          required
          value={counterpartyName}
          onChange={setCounterpartyName}
        />
      )}
      {relationship ? (
        <input type="hidden" name="counterpartyName" value={counterpartyName} />
      ) : null}
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
        disabled={disabled || Boolean(relationship && !counterpartyName)}
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
  value,
  onChange,
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {caption}
      <input
        name={name}
        required={required}
        type={type}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
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
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {caption}
      <select
        name={name}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
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

function LookupSelect({
  name,
  label: caption,
  path,
  required = false,
  value,
  initialValue,
  action,
  onSelect,
}: {
  name: string;
  label: string;
  path: string;
  required?: boolean;
  /** Controlled selection. Omit to let the select manage its own value. */
  value?: string;
  /** Preselected record that may fall outside the first page of results. */
  initialValue?: string;
  action?: { href: string; label: string; target?: string };
  onSelect: (option: RuntimeLookupOption | undefined) => void;
}) {
  const [options, setOptions] = useState<RuntimeLookupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/platform-runtime/lookups?path=${encodeURIComponent(path)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          items?: RuntimeLookupOption[];
          message?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.message ?? `Unable to load ${caption.toLowerCase()}.`);
        }
        setOptions(payload?.items ?? []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(
          reason instanceof Error
            ? reason.message
            : `Unable to load ${caption.toLowerCase()}.`,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [caption, path]);

  /*
   * A record deep-linked into this form can sit outside the first page of
   * results, so it is kept selectable instead of silently dropping the
   * preselection.
   */
  const selectable =
    initialValue && !options.some((option) => option.value === initialValue)
      ? [{ value: initialValue, label: initialValue }, ...options]
      : options;

  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      <span className="flex items-center justify-between gap-2">
        <span>{caption}</span>
        {action ? (
          <Link
            href={action.href}
            target={action.target ?? "_blank"}
            className="text-[11px] normal-case tracking-normal text-[var(--admin-primary)] hover:underline"
          >
            {action.label}
          </Link>
        ) : null}
      </span>
      <select
        name={name}
        required={required}
        disabled={loading}
        {...(value === undefined
          ? { defaultValue: initialValue ?? "" }
          : { value })}
        onChange={(event) =>
          onSelect(
            selectable.find((option) => option.value === event.target.value),
          )
        }
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal disabled:bg-slate-50"
      >
        <option value="">
          {loading ? `Loading ${caption.toLowerCase()}...` : `Select ${caption.toLowerCase()}`}
        </option>
        {selectable.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-[11px] font-normal normal-case tracking-normal text-rose-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function uploadRelationship(contractType: string) {
  if (contractType === "CUSTOMER_AGREEMENT") {
    return {
      name: "customerAccountId",
      label: "Customer account",
      path: "/super-admin/customers",
      createHref: "/customers/new",
      createLabel: "Create customer",
    };
  }
  if (contractType === "PARTNER_AGREEMENT") {
    return {
      name: "partnerId",
      label: "Partner",
      path: "/partners",
      createHref: "/partners/new",
      createLabel: "Create partner",
    };
  }
  return null;
}

function label(v: string) {
  return v
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
