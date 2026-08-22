"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ContractDocumentEditor } from "./contract-document-editor";
import { ModuleActionBar } from "@/app/_components/runtime/module-action-bar";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import { formatEnumLabel } from "@/lib/formatters";

type Template = {
  id: string;
  key: string;
  name: string;
  description?: string;
  contractType: string;
  signingMode?: string;
  lifecycleGatePurpose?: string;
  isActive: boolean;
  archivedAt?: string | null;
  status: string;
  versions: Array<{
    id: string;
    version: number;
    title: string;
    contentHtml: string;
    changeSummary?: string;
    lifecycleGatePurpose?: string;
    partyDefinitions?: Array<Record<string, unknown>>;
    signingConfig?: Record<string, unknown>;
    isPublished: boolean;
    createdAt: string;
  }>;
};

const moduleDefinition = getPlatformModuleDefinition("contract-templates");
const contractTypes = [
  "PARTNER_AGREEMENT",
  "MASTER_PARTNER_AGREEMENT",
  "COMMISSION_ADDENDUM",
  "TERRITORY_ADDENDUM",
  "REFERRAL_ADDENDUM",
  "CUSTOMER_AGREEMENT",
  "MASTER_SERVICES_AGREEMENT",
  "SUBSCRIPTION_AGREEMENT",
  "DATA_PROCESSING_AGREEMENT",
  "SLA",
  "STATEMENT_OF_WORK",
  "NDA",
  "SERVICE_AGREEMENT",
  "ADDENDUM",
  "AMENDMENT",
  "RENEWAL",
  "TERMINATION",
  "OTHER",
];

export function ContractTemplateEditor({
  templateId,
  roleKeys,
  permissionKeys,
}: {
  templateId?: string;
  roleKeys: string[];
  permissionKeys: string[];
}) {
  const router = useRouter();
  const [item, setItem] = useState<Template | null>(
    templateId
      ? null
      : {
          id: "",
          key: "",
          name: "",
          contractType: "SERVICE_AGREEMENT",
          isActive: false,
          status: "INACTIVE",
          versions: [],
        },
  );
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState("SERVICE_AGREEMENT");
  const [description, setDescription] = useState("");
  const [signingMode, setSigningMode] = useState("MIXED");
  const [lifecycleGatePurpose, setLifecycleGatePurpose] = useState("");
  const [requiredSignerRoles, setRequiredSignerRoles] = useState(
    "Authorized signatory",
  );
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState(
    "<h1>{{contract.title}}</h1><p>This agreement is between {{platform.legalName}} and {{counterparty.name}}.</p>",
  );
  const [summary, setSummary] = useState("");
  const [publish, setPublish] = useState(true);
  const [dirty, setDirty] = useState(!templateId);
  const [loadError, setLoadError] = useState("");
  const [samplePreview, setSamplePreview] = useState(false);
  const [placeholderExamples, setPlaceholderExamples] = useState<
    Record<string, string>
  >({});
  /**
   * The document as it would read with sample data in it.
   *
   * Derived, never stored, and **never fed back into the editor**. The previous
   * version swapped the editor's content for this string and kept the original
   * in a second piece of state to restore afterwards — so the template survived
   * only as long as that restore ran, and a save while previewing wrote sample
   * values into the template. The state it needed to be correct is gone rather
   * than better managed.
   *
   * Substitution uses `exampleHtml` from the API, which is produced by
   * `renderContractPlaceholders` — the function that renders the real document.
   * Substituting `exampleValue` as raw text is what printed
   * `["Employees","Attendance","Payroll"]` and a bare `99.5` in a preview whose
   * whole purpose is to show what the signed document will say.
   */
  const previewHtml = useMemo(
    () =>
      html.replace(
        /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
        (token, key: string) => placeholderExamples[key] || token,
      ),
    [html, placeholderExamples],
  );

  const load = useCallback(async () => {
    if (!templateId) return;
    const response = await fetch(`/api/contract-templates/${templateId}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setLoadError(data?.message ?? "Unable to load the contract template.");
      return;
    }
    const template = data as Template;
    setItem(template);
    setName(template.name);
    setKey(template.key);
    setType(template.contractType);
    setDescription(template.description ?? "");
    setSigningMode(template.signingMode ?? "MIXED");
    setLifecycleGatePurpose(template.lifecycleGatePurpose ?? "");
    const latest = template.versions[0];
    setTitle(latest?.title ?? template.name);
    setHtml(latest?.contentHtml ?? "");
    setLifecycleGatePurpose(
      latest?.lifecycleGatePurpose ?? template.lifecycleGatePurpose ?? "",
    );
    setRequiredSignerRoles(signerRolesForVersion(latest));
    setPublish(latest?.isPublished ?? false);
    setSummary("");
    setDirty(false);
    setLoadError("");
  }, [templateId]);

  useEffect(() => {
    if (!templateId) return;
    const controller = new AbortController();
    fetch(`/api/contract-templates/${templateId}`, {
      signal: controller.signal,
    })
      .then(async (response) => ({
        response,
        data: await response.json().catch(() => null),
      }))
      .then(({ response, data }) => {
        if (!response.ok) {
          setLoadError(
            data?.message ?? "Unable to load the contract template.",
          );
          return;
        }
        const template = data as Template;
        setItem(template);
        setName(template.name);
        setKey(template.key);
        setType(template.contractType);
        setDescription(template.description ?? "");
        setSigningMode(template.signingMode ?? "MIXED");
        setLifecycleGatePurpose(template.lifecycleGatePurpose ?? "");
        const latest = template.versions[0];
        setTitle(latest?.title ?? template.name);
        setHtml(latest?.contentHtml ?? "");
        setLifecycleGatePurpose(
          latest?.lifecycleGatePurpose ?? template.lifecycleGatePurpose ?? "",
        );
        setRequiredSignerRoles(signerRolesForVersion(latest));
        setPublish(latest?.isPublished ?? false);
        setSummary("");
        setDirty(false);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError")
          setLoadError("Unable to load the contract template.");
      });
    return () => controller.abort();
  }, [templateId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/contracts/placeholder-definitions", {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          payload: {
            items?: Array<{
              key: string;
              exampleValue?: string;
              exampleHtml?: string;
            }>;
          } | null,
        ) =>
          setPlaceholderExamples(
            Object.fromEntries(
              (payload?.items ?? []).map((item) => [
                item.key,
                /*
                 * `exampleHtml` is the example run through the document
                 * renderer: collections become a list or a table, percentages
                 * carry their sign, dates read as prose. Falling back to the
                 * raw value keeps the preview working against an API that
                 * predates the field rather than blanking every placeholder.
                 */
                item.exampleHtml ?? item.exampleValue ?? "",
              ]),
            ),
          ),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  if (!item)
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        {loadError || "Loading contract template…"}
      </div>
    );

  async function save() {
    const path = templateId
      ? `/api/contract-templates/${templateId}/versions`
      : "/api/contract-templates";
    const signerRoles = requiredSignerRoles
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const versionFields = {
      title,
      contentHtml: html,
      changeSummary: summary || (templateId ? undefined : "Initial version"),
      publish,
      lifecycleGatePurpose: lifecycleGatePurpose || undefined,
      partyDefinitions: signerRoles.map((role, index) => ({
        role,
        signingOrder: index + 1,
        required: true,
      })),
      signingConfig: { requiredSignerRoles: signerRoles },
    };
    const body = templateId
      ? versionFields
      : {
          ...versionFields,
          key,
          name,
          contractType: type,
          description,
          signingMode,
          documentMode: "EDITOR",
        };
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : (payload?.message ?? "Unable to save template."),
      );
    setDirty(false);
    if (!templateId) {
      router.push(`/templates/${payload.id}`);
      return { success: true, message: "Template created." };
    }
    await load();
    return { success: true, message: "Template version created." };
  }

  function update<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDirty(true);
  }

  /*
   * One boolean. Nothing to save, nothing to restore, nothing to lose if the
   * page is closed mid-preview.
   */
  function toggleSamplePreview() {
    setSamplePreview((current) => !current);
  }

  return (
    <main className="space-y-5">
      <ModuleActionBar
        actions={moduleDefinition.actions.map((action) =>
          action.key === "save"
            ? {
                ...action,
                label: templateId ? "Create version" : "Save",
              }
            : action,
        )}
        context={{
          scope: "record",
          record: { ...item, status: item.status },
          roleKeys,
          permissionKeys,
          mode: templateId ? "edit" : "create",
          isDirty: dirty,
        }}
        statusSlot={
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {item.status}
          </span>
        }
        onAction={async (action) => {
          if (action.key === "back") {
            if (dirty && !window.confirm("Discard unsaved template changes?"))
              return;
            router.push(moduleDefinition.routeBase);
            return;
          }
          if (action.key === "record-new")
            return router.push(`${moduleDefinition.routeBase}/new`);
          if (action.key === "record-refresh") {
            /*
             * Same rule as the runtime record page: Refresh answers "what is on
             * the server", which it cannot do while the editor still holds an
             * unsaved draft. The confirm is here because a template body is a
             * lot of work to lose silently.
             */
            if (dirty && !window.confirm("Discard unsaved template changes?"))
              return;
            await load();
            return { success: true, message: "Template reloaded." };
          }
          if (action.key === "save") return save();
          if (action.key === "duplicate" && templateId) {
            const response = await fetch(
              `/api/contract-templates/${templateId}/clone`,
              { method: "POST" },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok)
              throw new Error(payload?.message ?? "Unable to clone template.");
            router.push(`/templates/${payload.id}`);
            return {
              success: true,
              message: "Template cloned as a new draft.",
            };
          }
          if (
            ["activate", "deactivate", "archive"].includes(action.key) &&
            templateId
          ) {
            const state =
              action.key === "activate"
                ? "ACTIVE"
                : action.key === "deactivate"
                  ? "INACTIVE"
                  : "ARCHIVED";
            const response = await fetch(
              `/api/contract-templates/${templateId}/state`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ state }),
              },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok)
              throw new Error(
                payload?.message ?? "Unable to update template state.",
              );
            await load();
            return {
              success: true,
              message: `Template ${state.toLowerCase()}.`,
            };
          }
        }}
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-primary)]">
          Contract templates
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          {templateId ? name : "New contract template"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Versioned document content, typed placeholders, publishing, and
          lifecycle controls.
        </p>
      </section>

      {/*
        Settings and version history share a row; the document gets the page.

        This used to be one grid with the editor in a `minmax(0,1fr)` column and
        Version history in a permanent 280px one — and the editor then opened
        its own 20rem fields rail inside that. Two right-hand columns over an
        816px sheet left the document about 650px wide on a 1900px screen: the
        one thing on this page that needs the space had the least of it.
      */}
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
            {!templateId ? (
              <>
                <Field
                  label="Template key"
                  value={key}
                  onChange={(value) => update(setKey, value)}
                />
                <Field
                  label="Template name"
                  value={name}
                  onChange={(value) => update(setName, value)}
                />
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Contract type
                  <select
                    value={type}
                    onChange={(event) => update(setType, event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
                  >
                    {contractTypes.map((value) => (
                      <option key={value} value={value}>
                        {formatEnumLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Description"
                  value={description}
                  onChange={(value) => update(setDescription, value)}
                />
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Signing mode
                  <select
                    value={signingMode}
                    onChange={(event) =>
                      update(setSigningMode, event.target.value)
                    }
                    className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
                  >
                    {["SEQUENTIAL", "PARALLEL", "MIXED"].map((value) => (
                      <option key={value} value={value}>
                        {formatEnumLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <Field
              label="Document title"
              value={title}
              onChange={(value) => update(setTitle, value)}
            />
            <Field
              label="Lifecycle gate purpose"
              value={lifecycleGatePurpose}
              onChange={(value) => update(setLifecycleGatePurpose, value)}
            />
            <Field
              label="Required signer roles"
              value={requiredSignerRoles}
              onChange={(value) => update(setRequiredSignerRoles, value)}
            />
            {templateId ? (
              <Field
                label="Change summary"
                value={summary}
                onChange={(value) => update(setSummary, value)}
              />
            ) : null}
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-950">Version history</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Selecting an earlier version restores its content into a new
            editable draft; the original remains unchanged.
          </p>
          <div className="mt-3 space-y-2">
            {item.versions.map((version) => (
              <button
                type="button"
                key={version.id}
                onClick={() => {
                  setTitle(version.title);
                  setHtml(version.contentHtml);
                  setLifecycleGatePurpose(
                    version.lifecycleGatePurpose ??
                      item.lifecycleGatePurpose ??
                      "",
                  );
                  setRequiredSignerRoles(signerRolesForVersion(version));
                  setPublish(version.isPublished);
                  setSummary(`Restored from version ${version.version}`);
                  // Restoring a version puts you back in the editor: what you
                  // are looking at is now a draft, not a sample rendering.
                  setSamplePreview(false);
                  setDirty(true);
                }}
                className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
              >
                <span className="flex justify-between text-xs font-semibold">
                  <span>Version {version.version}</span>
                  <span
                    className={
                      version.isPublished
                        ? "text-emerald-700"
                        : "text-slate-400"
                    }
                  >
                    {version.isPublished ? "Published" : "Draft"}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {new Date(version.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
            {!item.versions.length ? (
              <p className="text-sm text-slate-500">
                The first version will be created on save.
              </p>
            ) : null}
          </div>
        </aside>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Document</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {samplePreview
                ? "Showing sample values. The template is unchanged and cannot be edited while this is on."
                : "Placeholders are inserted from the fields panel and resolved when an agreement is generated."}
            </p>
          </div>
          <button
            aria-pressed={samplePreview}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white"
            onClick={toggleSamplePreview}
            type="button"
          >
            {samplePreview ? "Return to editing" : "Preview sample data"}
          </button>
        </div>
        <ContractDocumentEditor
          onChange={(value) => update(setHtml, value)}
          previewHtml={samplePreview ? previewHtml : undefined}
          readOnly={samplePreview}
          value={html}
        />
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
          <input
            checked={publish}
            onChange={(event) => update(setPublish, event.target.checked)}
            type="checkbox"
          />
          Publish this version
        </label>
      </section>
    </main>
  );
}

function signerRolesForVersion(
  version: Template["versions"][number] | undefined,
) {
  const configured = version?.signingConfig?.requiredSignerRoles;
  if (Array.isArray(configured)) {
    const roles = configured.filter(
      (role): role is string =>
        typeof role === "string" && Boolean(role.trim()),
    );
    if (roles.length) return roles.join(", ");
  }
  if (Array.isArray(version?.partyDefinitions)) {
    const roles = version.partyDefinitions
      .map((definition) => definition.role)
      .filter(
        (role): role is string =>
          typeof role === "string" && Boolean(role.trim()),
      );
    if (roles.length) return roles.join(", ");
  }
  return "Authorized signatory";
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
      />
    </label>
  );
}
