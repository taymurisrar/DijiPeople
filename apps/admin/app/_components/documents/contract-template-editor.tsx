"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ContractDocumentEditor } from "./contract-document-editor";
import { ModuleActionBar } from "@/app/_components/runtime/module-action-bar";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import { formatEnumLabel } from "@/lib/formatters";
import { unwrapPlaceholderMarkup } from "@/lib/documents/placeholder-markup";

type ContentIssue = {
  code: string;
  severity: "error" | "issue" | "warning";
  message: string;
  samples: string[];
};

type TemplateVersion = {
  id: string;
  version: number;
  title: string;
  contentHtml: string;
  changeSummary?: string;
  lifecycleGatePurpose?: string | null;
  partyDefinitions?: Array<Record<string, unknown>>;
  signingConfig?: Record<string, unknown>;
  isPublished: boolean;
  publishedAt?: string | null;
  createdAt: string;
  editable?: boolean;
  agreementCount?: number;
  contentIssues?: ContentIssue[];
};

type Template = {
  id: string;
  key: string;
  name: string;
  description?: string;
  contractType: string;
  signingMode?: string;
  lifecycleGatePurpose?: string | null;
  isActive: boolean;
  archivedAt?: string | null;
  status: string;
  versions: TemplateVersion[];
};

type TemplateOptions = {
  lifecycleGates: Array<{ key: string; label: string; contractTypes: string[] }>;
  signerRoles: Array<{ key: string; label: string; side: string }>;
};

type SigningOrder = "COUNTERPARTY_FIRST" | "PLATFORM_FIRST" | "PARALLEL";

const COUNTERPARTY = "COUNTERPARTY_SIGNATORY";
const PLATFORM = "PLATFORM_SIGNATORY";

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
  const [options, setOptions] = useState<TemplateOptions | null>(null);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState("SERVICE_AGREEMENT");
  const [description, setDescription] = useState("");
  const [lifecycleGatePurpose, setLifecycleGatePurpose] = useState("");
  /*
   * Stable keys from the API's signer-role catalog, in signing order. The
   * free-text field this replaces stored "Authorized signatory" into JSON
   * nothing read; these keys decide the parties of every agreement drafted
   * from the template.
   */
  const [signerRoles, setSignerRoles] = useState<string[]>([COUNTERPARTY]);
  const [signingOrder, setSigningOrder] =
    useState<SigningOrder>("COUNTERPARTY_FIRST");
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState(
    "<h1>{{contract.title}}</h1><p>This agreement is between {{platform.legalName}} and {{counterparty.name}}.</p>",
  );
  const [summary, setSummary] = useState("");
  const [publish, setPublish] = useState(false);
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

  const applyTemplate = useCallback((template: Template) => {
    setItem(template);
    setName(template.name);
    setKey(template.key);
    setType(template.contractType);
    setDescription(template.description ?? "");
    const latest = template.versions[0];
    setTitle(latest?.title ?? template.name);
    setHtml(unwrapPlaceholderMarkup(latest?.contentHtml ?? ""));
    setLifecycleGatePurpose(
      latest?.lifecycleGatePurpose ?? template.lifecycleGatePurpose ?? "",
    );
    const signers = signersForVersion(latest);
    setSignerRoles(signers.roles);
    setSigningOrder(signers.order);
    setPublish(false);
    setSummary("");
    setDirty(false);
    setLoadError("");
  }, []);

  const load = useCallback(async () => {
    if (!templateId) return;
    const response = await fetch(`/api/contract-templates/${templateId}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setLoadError(data?.message ?? "Unable to load the contract template.");
      return;
    }
    applyTemplate(data as Template);
  }, [templateId, applyTemplate]);

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
        applyTemplate(data as Template);
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError")
          setLoadError("Unable to load the contract template.");
      });
    return () => controller.abort();
  }, [templateId, applyTemplate]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/contracts/template-options", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: TemplateOptions | null) => {
        if (payload) setOptions(payload);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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

  const gateOptions = useMemo(
    () =>
      (options?.lifecycleGates ?? []).filter((gate) =>
        gate.contractTypes.includes(type),
      ),
    [options, type],
  );
  /*
   * Until the catalog loads nothing is judged unsupported — the stored value
   * is shown, not flagged, rather than flashing an error on every open.
   */
  const gateSupported =
    !options ||
    !lifecycleGatePurpose ||
    gateOptions.some((gate) => gate.key === lifecycleGatePurpose);

  if (!item)
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        {loadError || "Loading contract template…"}
      </div>
    );

  const latest = item.versions[0];
  const publishedVersion = item.versions.find((version) => version.isPublished);
  const draftEditable = Boolean(latest?.editable);
  const latestIssues = latest?.contentIssues ?? [];

  function signingPayload() {
    const ordered =
      signerRoles.length === 2 && signingOrder === "PLATFORM_FIRST"
        ? [PLATFORM, COUNTERPARTY]
        : signerRoles.length === 2
          ? [COUNTERPARTY, PLATFORM]
          : signerRoles;
    return {
      requiredSignerRoles: ordered,
      signingMode:
        signerRoles.length === 2 && signingOrder === "PARALLEL"
          ? "PARALLEL"
          : "SEQUENTIAL",
    };
  }

  function validate() {
    if (!gateSupported)
      throw new Error(
        `"${lifecycleGatePurpose}" is not a supported lifecycle gate. Choose one from the list.`,
      );
    if (!signerRoles.length)
      throw new Error("Choose at least one required signer role.");
  }

  async function request(path: string, method: string, body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : (payload?.message ?? "The template could not be saved."),
      );
    return payload;
  }

  async function save() {
    validate();
    const common = {
      title,
      contentHtml: html,
      lifecycleGatePurpose: lifecycleGatePurpose || "",
      ...signingPayload(),
    };
    if (!templateId) {
      const payload = await request("/api/contract-templates", "POST", {
        ...common,
        changeSummary: summary || "Initial version",
        publish,
        key,
        name,
        contractType: type,
        description,
        documentMode: "EDITOR",
      });
      setDirty(false);
      router.push(`/templates/${payload.id}`);
      return { success: true, message: "Template created." };
    }
    if (draftEditable && latest) {
      await request(
        `/api/contract-templates/${templateId}/versions/${latest.id}`,
        "PATCH",
        { ...common, ...(summary ? { changeSummary: summary } : {}) },
      );
      setDirty(false);
      await load();
      return {
        success: true,
        message: `Draft version ${latest.version} saved.`,
      };
    }
    const created = await request(
      `/api/contract-templates/${templateId}/versions`,
      "POST",
      { ...common, changeSummary: summary || undefined, publish: false },
    );
    setDirty(false);
    await load();
    return {
      success: true,
      message: `Draft version ${created.version} created. Publish it when it is ready.`,
    };
  }

  function update<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDirty(true);
  }

  function toggleSignerRole(role: string, checked: boolean) {
    update(
      setSignerRoles,
      checked
        ? [...signerRoles.filter((value) => value !== role), role]
        : signerRoles.filter((value) => value !== role),
    );
  }

  /*
   * One boolean. Nothing to save, nothing to restore, nothing to lose if the
   * page is closed mid-preview.
   */
  function toggleSamplePreview() {
    setSamplePreview((current) => !current);
  }

  const signerLabels = (options?.signerRoles ?? [])
    .filter((role) => signerRoles.includes(role.key))
    .map((role) => role.label);

  return (
    <main className="space-y-5">
      <ModuleActionBar
        actions={moduleDefinition.actions.map((action) =>
          action.key === "save"
            ? {
                ...action,
                label: !templateId
                  ? "Save"
                  : draftEditable
                    ? "Save draft"
                    : "Save as new draft",
              }
            : action,
        )}
        context={{
          scope: "record",
          record: {
            ...item,
            status: item.status,
            latestDraftPublishable: Boolean(
              templateId && latest && !latest.isPublished,
            ),
            hasPublishedVersion: Boolean(templateId && publishedVersion),
          },
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
          if (action.key === "publish" && templateId && latest) {
            // Publishing what is stored, never what is still in the editor.
            if (dirty) throw new Error("Save the draft before publishing it.");
            await request(
              `/api/contract-templates/${templateId}/versions/${latest.id}/publish`,
              "POST",
            );
            await load();
            return {
              success: true,
              message: `Version ${latest.version} published.`,
            };
          }
          if (action.key === "unpublish" && templateId && publishedVersion) {
            await request(
              `/api/contract-templates/${templateId}/versions/${publishedVersion.id}/unpublish`,
              "POST",
            );
            await load();
            return {
              success: true,
              message: `Version ${publishedVersion.version} unpublished; the template is inactive.`,
            };
          }
          if (action.key === "duplicate" && templateId) {
            const payload = await request(
              `/api/contract-templates/${templateId}/clone`,
              "POST",
            );
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
            await request(
              `/api/contract-templates/${templateId}/state`,
              "PATCH",
              { state },
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
              </>
            ) : null}
            <Field
              label="Document title"
              value={title}
              onChange={(value) => update(setTitle, value)}
            />
            <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Lifecycle gate purpose
              <select
                aria-invalid={!gateSupported}
                value={lifecycleGatePurpose}
                onChange={(event) =>
                  update(setLifecycleGatePurpose, event.target.value)
                }
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal aria-invalid:border-rose-400"
              >
                <option value="">None</option>
                {gateOptions.map((gate) => (
                  <option key={gate.key} value={gate.key}>
                    {gate.label}
                  </option>
                ))}
                {lifecycleGatePurpose &&
                !gateOptions.some(
                  (gate) => gate.key === lifecycleGatePurpose,
                ) ? (
                  <option value={lifecycleGatePurpose} disabled>
                    {lifecycleGatePurpose} (not supported)
                  </option>
                ) : null}
              </select>
              {!gateSupported ? (
                <span className="text-[11px] font-medium normal-case tracking-normal text-rose-600">
                  Choose a supported gate before saving.
                </span>
              ) : null}
            </label>
            <fieldset className="grid gap-1.5">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Required signer roles
              </legend>
              <div className="grid gap-1.5 rounded-xl border border-slate-200 px-3 py-2">
                {(options?.signerRoles ?? []).map((role) => (
                  <label
                    key={role.key}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      checked={signerRoles.includes(role.key)}
                      onChange={(event) =>
                        toggleSignerRole(role.key, event.target.checked)
                      }
                      type="checkbox"
                    />
                    {role.label}
                  </label>
                ))}
              </div>
              {!signerRoles.length ? (
                <span className="text-[11px] font-medium text-rose-600">
                  Choose at least one signer.
                </span>
              ) : null}
            </fieldset>
            {signerRoles.length === 2 ? (
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Signing order
                <select
                  value={signingOrder}
                  onChange={(event) =>
                    update(setSigningOrder, event.target.value as SigningOrder)
                  }
                  className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal"
                >
                  <option value="COUNTERPARTY_FIRST">
                    Customer / partner first, then DijiPeople
                  </option>
                  <option value="PLATFORM_FIRST">
                    DijiPeople first, then customer / partner
                  </option>
                  <option value="PARALLEL">In any order</option>
                </select>
              </label>
            ) : null}
            {templateId ? (
              <Field
                label="Change summary"
                value={summary}
                onChange={(value) => update(setSummary, value)}
              />
            ) : null}
          </div>

          {latestIssues.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <h2 className="font-semibold">
                Content check — version {latest?.version}
              </h2>
              <ul className="mt-2 space-y-2">
                {latestIssues.map((issue) => (
                  <li key={issue.code}>
                    <span className="mr-2 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      {issue.severity === "error"
                        ? "Blocks publishing"
                        : issue.severity === "issue"
                          ? "Blocks sending"
                          : "Review"}
                    </span>
                    {issue.message}
                    {issue.samples.length ? (
                      <span className="mt-1 block break-words font-mono text-[11px] text-amber-800">
                        {issue.samples.slice(0, 8).join(" · ")}
                        {issue.samples.length > 8
                          ? ` · +${issue.samples.length - 8} more`
                          : ""}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-950">Version history</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Selecting an earlier version restores its content into the editor;
            the original remains unchanged.
          </p>
          <div className="mt-3 space-y-2">
            {item.versions.map((version) => (
              <button
                type="button"
                key={version.id}
                onClick={() => {
                  setTitle(version.title);
                  setHtml(unwrapPlaceholderMarkup(version.contentHtml));
                  setLifecycleGatePurpose(
                    version.lifecycleGatePurpose ??
                      item.lifecycleGatePurpose ??
                      "",
                  );
                  const signers = signersForVersion(version);
                  setSignerRoles(signers.roles);
                  setSigningOrder(signers.order);
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
                        : version.publishedAt
                          ? "text-slate-500"
                          : "text-amber-700"
                    }
                  >
                    {version.isPublished
                      ? "Published"
                      : version.publishedAt
                        ? "Superseded"
                        : version.editable
                          ? "Draft (editable)"
                          : "Draft"}
                  </span>
                </span>
                <span className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>
                    {new Date(version.createdAt).toLocaleDateString()}
                  </span>
                  {version.agreementCount ? (
                    <span>
                      {version.agreementCount} agreement
                      {version.agreementCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
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
          contractType={type}
          signerRoles={signerLabels}
        />
        {!templateId ? (
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
            <input
              checked={publish}
              onChange={(event) => update(setPublish, event.target.checked)}
              type="checkbox"
            />
            Publish this version
          </label>
        ) : null}
      </section>
    </main>
  );
}

/**
 * The signer plan a version declares. A version saved before roles were
 * structured (free text such as "Authorized signatory", or the seed's party
 * list) produced agreements signed by the counterparty alone, so that is what
 * it shows — which is also what the API keeps doing for it.
 */
function signersForVersion(version: TemplateVersion | undefined): {
  roles: string[];
  order: SigningOrder;
} {
  const config = version?.signingConfig;
  const configured = Array.isArray(config?.requiredSignerRoles)
    ? (config.requiredSignerRoles as unknown[]).filter(
        (role): role is string => role === COUNTERPARTY || role === PLATFORM,
      )
    : [];
  if (!configured.length)
    return { roles: [COUNTERPARTY], order: "COUNTERPARTY_FIRST" };
  return {
    roles: configured,
    order:
      config?.mode === "PARALLEL"
        ? "PARALLEL"
        : configured[0] === PLATFORM
          ? "PLATFORM_FIRST"
          : "COUNTERPARTY_FIRST",
  };
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
