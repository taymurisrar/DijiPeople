"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ContractDocumentEditor } from "./contract-document-editor";
import { ModuleActionBar } from "@/app/_components/runtime/module-action-bar";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";

type Template = {
  id: string;
  key: string;
  name: string;
  description?: string;
  contractType: string;
  isActive: boolean;
  archivedAt?: string | null;
  status: string;
  versions: Array<{
    id: string;
    version: number;
    title: string;
    contentHtml: string;
    changeSummary?: string;
    isPublished: boolean;
    createdAt: string;
  }>;
};

const moduleDefinition = getPlatformModuleDefinition("contract-templates");

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
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState(
    "<h1>{{contract.title}}</h1><p>This agreement is between {{platform.legalName}} and {{counterparty.name}}.</p>",
  );
  const [summary, setSummary] = useState("");
  const [publish, setPublish] = useState(true);
  const [dirty, setDirty] = useState(!templateId);
  const [loadError, setLoadError] = useState("");

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
    const latest = template.versions[0];
    setTitle(latest?.title ?? template.name);
    setHtml(latest?.contentHtml ?? "");
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
          setLoadError(data?.message ?? "Unable to load the contract template.");
          return;
        }
        const template = data as Template;
        setItem(template);
        setName(template.name);
        setKey(template.key);
        setType(template.contractType);
        setDescription(template.description ?? "");
        const latest = template.versions[0];
        setTitle(latest?.title ?? template.name);
        setHtml(latest?.contentHtml ?? "");
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
    const body = templateId
      ? { title, contentHtml: html, changeSummary: summary, publish }
      : { key, name, contractType: type, description, title, contentHtml: html, publish };
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
          : payload?.message ?? "Unable to save template.",
      );
    setDirty(false);
    if (!templateId) {
      router.push(`/contract-templates/${payload.id}`);
      return { success: true, message: "Template created." };
    }
    await load();
    return { success: true, message: "Template version created." };
  }

  function update<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setDirty(true);
  }

  return (
    <main className="space-y-5">
      <ModuleActionBar
        actions={moduleDefinition.actions}
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
            if (dirty && !window.confirm("Discard unsaved template changes?")) return;
            router.push("/contract-templates");
            return;
          }
          if (action.key === "save") return save();
          if (action.key === "duplicate" && templateId) {
            const response = await fetch(`/api/contract-templates/${templateId}/clone`, { method: "POST" });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message ?? "Unable to clone template.");
            router.push(`/contract-templates/${payload.id}`);
            return { success: true, message: "Template cloned as a new draft." };
          }
          if (["activate", "deactivate", "archive"].includes(action.key) && templateId) {
            const state = action.key === "activate" ? "ACTIVE" : action.key === "deactivate" ? "INACTIVE" : "ARCHIVED";
            const response = await fetch(`/api/contract-templates/${templateId}/state`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ state }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.message ?? "Unable to update template state.");
            await load();
            return { success: true, message: `Template ${state.toLowerCase()}.` };
          }
        }}
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-primary)]">Contract templates</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{templateId ? name : "New contract template"}</h1>
        <p className="mt-1 text-sm text-slate-500">Versioned document content, typed placeholders, publishing, and lifecycle controls.</p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
            {!templateId ? (
              <>
                <Field label="Template key" value={key} onChange={(value) => update(setKey, value)} />
                <Field label="Template name" value={name} onChange={(value) => update(setName, value)} />
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Contract type
                  <select value={type} onChange={(event) => update(setType, event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal">
                    {["PARTNER_AGREEMENT", "CUSTOMER_AGREEMENT", "NDA", "SERVICE_AGREEMENT", "ADDENDUM", "OTHER"].map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <Field label="Description" value={description} onChange={(value) => update(setDescription, value)} />
              </>
            ) : null}
            <Field label="Document title" value={title} onChange={(value) => update(setTitle, value)} />
            {templateId ? <Field label="Change summary" value={summary} onChange={(value) => update(setSummary, value)} /> : null}
          </div>
          <ContractDocumentEditor value={html} onChange={(value) => update(setHtml, value)} />
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={publish} onChange={(event) => update(setPublish, event.target.checked)} />
            Publish this version
          </label>
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-950">Version history</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Selecting an earlier version restores its content into a new editable draft; the original remains unchanged.</p>
          <div className="mt-3 space-y-2">
            {item.versions.map((version) => (
              <button
                type="button"
                key={version.id}
                onClick={() => {
                  setTitle(version.title);
                  setHtml(version.contentHtml);
                  setSummary(`Restored from version ${version.version}`);
                  setDirty(true);
                }}
                className="w-full rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50"
              >
                <span className="flex justify-between text-xs font-semibold">
                  <span>Version {version.version}</span>
                  <span className={version.isPublished ? "text-emerald-700" : "text-slate-400"}>{version.isPublished ? "Published" : "Draft"}</span>
                </span>
                <span className="mt-1 block text-xs text-slate-500">{new Date(version.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
            {!item.versions.length ? <p className="text-sm text-slate-500">The first version will be created on save.</p> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal" />
    </label>
  );
}
