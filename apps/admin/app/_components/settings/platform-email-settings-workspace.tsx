"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  KeyRound,
  MailCheck,
  PlugZap,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { AppNotification } from "@/app/_components/notifications/app-notification";
import type {
  PlatformEmailDelivery,
  PlatformEmailSettings,
  PlatformEmailTemplate,
} from "@/app/(internal)/settings/email/page";

type Notice = { tone: "success" | "error"; text: string };

export function PlatformEmailSettingsWorkspace({
  initialSettings,
  initialTemplates,
  initialDeliveries,
}: {
  initialSettings: PlatformEmailSettings;
  initialTemplates: PlatformEmailTemplate[];
  initialDeliveries: PlatformEmailDelivery[];
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(initialSettings);
  const [form, setForm] = useState(initialSettings);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const passwordRef = useRef<HTMLInputElement>(null);
  const { canManage, canManageCredentials, canTest } = form.capabilities;
  const changed =
    JSON.stringify(form) !== JSON.stringify(baseline) ||
    Boolean(smtpPassword) ||
    clearPassword;

  function update<K extends keyof PlatformEmailSettings>(
    key: K,
    value: PlatformEmailSettings[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`/api/super-admin/platform-email${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        payload?.message ?? "Unable to complete the email request.",
      );
    return payload;
  }

  async function save(close = false) {
    setBusy("save");
    setNotice(null);
    try {
      const saved = (await request("", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: form.enabled,
          providerType: form.providerType,
          fromName: form.fromName,
          fromEmail: form.fromEmail,
          replyToEmail: form.replyToEmail || null,
          smtpHost: form.smtpHost,
          smtpPort: Number(form.smtpPort),
          smtpAuthEnabled: form.smtpAuthEnabled,
          smtpUsername: form.smtpUsername,
          smtpPassword: smtpPassword || undefined,
          clearSmtpPassword: clearPassword,
          smtpSecurity: form.smtpSecurity,
          connectionTimeoutMs: Number(form.connectionTimeoutMs),
        }),
      })) as PlatformEmailSettings;
      setForm(saved);
      setBaseline(saved);
      setSmtpPassword("");
      setClearPassword(false);
      setNotice({ tone: "success", text: "Platform email settings saved." });
      if (close) router.push("/settings");
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (changed) {
      setNotice({
        tone: "error",
        text: "Save or reset your changes before testing the connection.",
      });
      return;
    }
    setBusy("connection");
    setNotice(null);
    try {
      const result = (await request("/test-connection", {
        method: "POST",
      })) as { message: string };
      setNotice({ tone: "success", text: result.message });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    if (!recipient.trim()) return;
    if (changed) {
      setNotice({
        tone: "error",
        text: "Save or reset your changes before sending a test email.",
      });
      return;
    }
    setBusy("send");
    setNotice(null);
    try {
      const result = (await request("/test-email", {
        method: "POST",
        body: JSON.stringify({ recipient, subject, message }),
      })) as { success: boolean; message: string };
      if (!result.success) throw new Error(result.message);
      setNotice({ tone: "success", text: result.message });
      const recent = (await request("/deliveries?limit=25")) as {
        items?: PlatformEmailDelivery[];
      };
      setDeliveries(recent.items ?? []);
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setForm(baseline);
    setSmtpPassword("");
    setClearPassword(false);
    setNotice(null);
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <AppNotification tone={notice.tone}>{notice.text}</AppNotification>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <fieldset disabled={!canManage} className="contents">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Delivery provider
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                One platform-level provider supplies internal DijiPeople
                messages. Tenant email configuration is separate and is not
                exposed here.
              </p>
            </div>
            <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => update("enabled", event.target.checked)}
                className="h-4 w-4 accent-[var(--admin-primary)]"
              />
              Delivery enabled
            </label>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <ProviderChoice
              title="Console / development"
              description="Records a rendered preview in server logs. It is blocked as a production delivery provider."
              selected={form.providerType === "CONSOLE"}
              onSelect={() => update("providerType", "CONSOLE")}
            />
            <ProviderChoice
              title="SMTP"
              description="Deliver through a standard SMTP relay using controlled TLS and authentication settings."
              selected={form.providerType === "SMTP"}
              onSelect={() => update("providerType", "SMTP")}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <TextField
              label="From name"
              value={form.fromName}
              onChange={(value) => update("fromName", value)}
            />
            <TextField
              label="From email"
              type="email"
              value={form.fromEmail}
              onChange={(value) => update("fromEmail", value)}
            />
            <TextField
              label="Reply-to email"
              type="email"
              value={form.replyToEmail ?? ""}
              onChange={(value) => update("replyToEmail", value || null)}
            />
            <ReadOnlyFact label="Appearance" value="Platform-level delivery" />
          </div>

          {form.providerType === "SMTP" ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--admin-primary)]" />
                <h3 className="text-sm font-semibold text-slate-950">
                  SMTP connection
                </h3>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <TextField
                  label="SMTP host"
                  value={form.smtpHost}
                  onChange={(value) => update("smtpHost", value)}
                />
                <NumberField
                  label="Port"
                  value={form.smtpPort}
                  min={1}
                  max={65535}
                  onChange={(value) => update("smtpPort", value)}
                />
                <SelectField
                  label="Encryption"
                  value={form.smtpSecurity}
                  options={[
                    ["STARTTLS", "STARTTLS"],
                    ["TLS", "Implicit TLS"],
                    ["NONE", "None"],
                  ]}
                  onChange={(value) =>
                    update(
                      "smtpSecurity",
                      value as PlatformEmailSettings["smtpSecurity"],
                    )
                  }
                />
                <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800">
                  SMTP authentication
                  <input
                    type="checkbox"
                    checked={form.smtpAuthEnabled}
                    onChange={(event) =>
                      update("smtpAuthEnabled", event.target.checked)
                    }
                    className="h-4 w-4 accent-[var(--admin-primary)]"
                  />
                </label>
                {form.smtpAuthEnabled ? (
                  <>
                    <TextField
                      label="Username"
                      value={form.smtpUsername}
                      onChange={(value) => update("smtpUsername", value)}
                    />
                    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      New password
                      <input
                        ref={passwordRef}
                        type="password"
                        autoComplete="new-password"
                        value={smtpPassword}
                        disabled={clearPassword || !canManageCredentials}
                        onChange={(event) => {
                          setSmtpPassword(event.target.value);
                          setClearPassword(false);
                        }}
                        placeholder={
                          form.passwordConfigured
                            ? "Leave blank to keep current password"
                            : "Enter SMTP password"
                        }
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
                      />
                      <span className="flex flex-wrap items-center gap-2 font-normal normal-case tracking-normal">
                        {form.passwordConfigured && !clearPassword ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <KeyRound className="h-3.5 w-3.5" /> Password
                            configured
                          </span>
                        ) : (
                          <span>No saved password</span>
                        )}
                        {form.passwordConfigured ? (
                          <>
                            <button
                              type="button"
                              disabled={!canManageCredentials}
                              className="font-semibold text-[var(--admin-primary)]"
                              onClick={() => passwordRef.current?.focus()}
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              disabled={!canManageCredentials}
                              className="font-semibold text-rose-700"
                              onClick={() => {
                                setClearPassword(true);
                                setSmtpPassword("");
                              }}
                            >
                              {clearPassword ? "Will clear on save" : "Clear"}
                            </button>
                          </>
                        ) : null}
                      </span>
                    </label>
                  </>
                ) : null}
                <NumberField
                  label="Connection timeout (ms)"
                  value={form.connectionTimeoutMs}
                  min={1000}
                  max={120000}
                  onChange={(value) => update("connectionTimeoutMs", value)}
                />
              </div>
            </div>
          ) : (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Console delivery is for development and controlled testing only.
              It does not send email to the recipient.
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
            <button
              type="button"
              disabled={!changed || Boolean(busy)}
              onClick={reset}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
            <button
              type="button"
              disabled={!changed || Boolean(busy)}
              onClick={() => void save(true)}
              className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              Save & close
            </button>
            <button
              type="button"
              disabled={!changed || Boolean(busy)}
              onClick={() => void save(false)}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </fieldset>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <PlugZap className="h-4 w-4 text-[var(--admin-primary)]" />
            <h2 className="text-lg font-semibold text-slate-950">
              Test connection
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Verify the saved provider without sending a message.
          </p>
          <fieldset disabled={!canTest} className="contents">
            <button
              type="button"
              disabled={!form.enabled || Boolean(busy)}
              onClick={() => void testConnection()}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              {busy === "connection" ? "Testing…" : "Test connection"}
            </button>
          </fieldset>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <MailCheck className="h-4 w-4 text-[var(--admin-primary)]" />
            <h2 className="text-lg font-semibold text-slate-950">
              Send test email
            </h2>
          </div>
          <fieldset disabled={!canTest} className="contents">
            <div className="mt-4 grid gap-3">
              <TextField
                label="Recipient"
                type="email"
                value={recipient}
                onChange={setRecipient}
              />
              <TextField
                label="Subject (optional)"
                value={subject}
                onChange={setSubject}
              />
              <TextField
                label="Message (optional)"
                value={message}
                onChange={setMessage}
              />
            </div>
            <button
              type="button"
              disabled={!form.enabled || !recipient.trim() || Boolean(busy)}
              onClick={() => void sendTest()}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              <MailCheck className="h-4 w-4" />
              {busy === "send" ? "Sending…" : "Send test email"}
            </button>
          </fieldset>
        </div>
      </section>

      <TemplateManager
        initialTemplates={initialTemplates}
        request={request}
        canManage={canManage}
      />
      <DeliveryTable items={deliveries} />
    </div>
  );
}

function TemplateManager({
  initialTemplates,
  request,
  canManage,
}: {
  initialTemplates: PlatformEmailTemplate[];
  request: (path: string, init?: RequestInit) => Promise<unknown>;
  canManage: boolean;
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(initialTemplates[0]?.id ?? "");
  const selected = templates.find((item) => item.id === selectedId) ?? null;
  const [draft, setDraft] = useState<PlatformEmailTemplate | null>(selected);
  const [category, setCategory] = useState<TemplateCategory>("ALL");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const visibleTemplates = useMemo(
    () =>
      category === "ALL"
        ? templates
        : templates.filter(
            (template) => templateCategory(template.eventCode) === category,
          ),
    [category, templates],
  );
  const isDirty = Boolean(
    draft && selected && JSON.stringify(draft) !== JSON.stringify(selected),
  );
  const variables = useMemo(
    () => formatVariables(draft?.availableVariables),
    [draft?.availableVariables],
  );

  function select(id: string) {
    setSelectedId(id);
    setDraft(templates.find((item) => item.id === id) ?? null);
    setNotice(null);
  }

  function selectCategory(nextCategory: TemplateCategory) {
    setCategory(nextCategory);
    const first =
      nextCategory === "ALL"
        ? templates[0]
        : templates.find(
            (template) => templateCategory(template.eventCode) === nextCategory,
          );
    setSelectedId(first?.id ?? "");
    setDraft(first ?? null);
    setNotice(null);
  }

  async function saveTemplate() {
    if (!draft) return;
    setSaving(true);
    setNotice(null);
    try {
      const saved = (await request(`/templates/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          subjectTemplate: draft.subjectTemplate,
          htmlTemplate: draft.htmlTemplate,
          textTemplate: draft.textTemplate,
          enabled: draft.status === "ACTIVE",
        }),
      })) as PlatformEmailTemplate;
      setTemplates((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setDraft(saved);
      setNotice({ tone: "success", text: "System email template saved." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">System templates</h2>
      <p className="mt-1 text-sm text-slate-600">
        System keys are protected from deletion. Edit content or disable
        delivery while retaining the event mapping.
      </p>
      <div
        className="mt-4 flex flex-wrap gap-2"
        aria-label="Template categories"
      >
        {TEMPLATE_CATEGORIES.map((item) => {
          const count =
            item.key === "ALL"
              ? templates.length
              : templates.filter(
                  (template) =>
                    templateCategory(template.eventCode) === item.key,
                ).length;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={category === item.key}
              onClick={() => selectCategory(item.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                category === item.key
                  ? "border-[var(--admin-primary)] bg-[var(--admin-surface-tint)] text-[var(--admin-primary)]"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>
      {visibleTemplates.length && draft ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
            {visibleTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => select(template.id)}
                className={`w-full rounded-xl border p-3 text-left ${
                  template.id === selectedId
                    ? "border-[var(--admin-primary)] bg-[var(--admin-surface-tint)]"
                    : "border-slate-200"
                }`}
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {template.name}
                </span>
                <span className="mt-1 block truncate font-mono text-[10px] text-slate-500">
                  {template.templateKey}
                </span>
              </button>
            ))}
          </div>
          <fieldset disabled={!canManage} className="space-y-4">
            {notice ? (
              <AppNotification tone={notice.tone}>
                {notice.text}
              </AppNotification>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {draft.eventCode} · Version {draft.version}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-950">
                  {draft.name}
                </h3>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={draft.status === "ACTIVE"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      status: event.target.checked ? "ACTIVE" : "DRAFT",
                    })
                  }
                  className="h-4 w-4 accent-[var(--admin-primary)]"
                />
                Enabled
              </label>
            </div>
            <TextField
              label="Subject"
              value={draft.subjectTemplate}
              onChange={(value) =>
                setDraft({ ...draft, subjectTemplate: value })
              }
            />
            <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              HTML body
              <textarea
                rows={9}
                value={draft.htmlTemplate}
                onChange={(event) =>
                  setDraft({ ...draft, htmlTemplate: event.target.value })
                }
                className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Text fallback
              <textarea
                rows={5}
                value={draft.textTemplate ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, textTemplate: event.target.value })
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">
                Available variables
              </p>
              <p className="mt-1 break-words font-mono text-[11px] text-slate-500">
                {variables || "No variables declared"}
              </p>
            </div>
            <details className="rounded-xl border border-slate-200">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
                Preview HTML
              </summary>
              <iframe
                title={`${draft.name} preview`}
                sandbox=""
                srcDoc={draft.htmlTemplate}
                className="h-72 w-full border-t border-slate-200 bg-white"
              />
            </details>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving || !isDirty}
                onClick={() => void saveTemplate()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save template"}
              </button>
            </div>
          </fieldset>
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          {templates.length
            ? "No system templates exist in this category yet. Event mappings are added only when a real workflow trigger exists."
            : "No system email templates have been initialized."}
        </p>
      )}
    </section>
  );
}

type TemplateCategory =
  | "ALL"
  | "LEADS"
  | "AGREEMENTS"
  | "ONBOARDING"
  | "TENANTS"
  | "SUPPORT"
  | "BILLING"
  | "AUTH"
  | "OTHER";

const TEMPLATE_CATEGORIES: Array<{
  key: TemplateCategory;
  label: string;
}> = [
  { key: "ALL", label: "All" },
  { key: "LEADS", label: "Lead acknowledgement" },
  { key: "AGREEMENTS", label: "Agreement / contract" },
  { key: "ONBOARDING", label: "Onboarding" },
  { key: "TENANTS", label: "Tenant activation" },
  { key: "SUPPORT", label: "Support" },
  { key: "BILLING", label: "Billing" },
  { key: "AUTH", label: "Authentication" },
  { key: "OTHER", label: "Other" },
];

function templateCategory(eventCode: string): Exclude<TemplateCategory, "ALL"> {
  if (eventCode.startsWith("LEAD_")) return "LEADS";
  if (eventCode.includes("AGREEMENT") || eventCode.startsWith("CONTRACT_"))
    return "AGREEMENTS";
  if (eventCode.includes("ONBOARDING")) return "ONBOARDING";
  if (eventCode.startsWith("TENANT_")) return "TENANTS";
  if (eventCode.startsWith("SUPPORT_")) return "SUPPORT";
  if (eventCode.startsWith("BILLING_")) return "BILLING";
  if (eventCode.startsWith("AUTH_")) return "AUTH";
  return "OTHER";
}

function DeliveryTable({ items }: { items: PlatformEmailDelivery[] }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-lg font-semibold text-slate-950">Recent sends</h2>
        <p className="mt-1 text-sm text-slate-600">
          Delivery history contains operational metadata only; credentials and
          message bodies are not exposed here.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[800px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Recipient</th>
              <th className="px-5 py-3">Event</th>
              <th className="px-5 py-3">Provider</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Requested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length ? (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900">
                      {item.recipient}
                    </p>
                    <p className="max-w-xs truncate text-xs text-slate-500">
                      {item.subject}
                    </p>
                    {item.errorMessage ? (
                      <p className="mt-1 max-w-xs truncate text-xs text-rose-700">
                        {item.errorMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {pretty(item.eventCode)}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {item.providerType ? pretty(item.providerType) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {pretty(item.status)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center text-slate-500"
                >
                  No platform emails have been requested yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProviderChoice({
  title,
  description,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`rounded-2xl border p-4 text-left ${
        selected
          ? "border-[var(--admin-primary)] bg-[var(--admin-surface-tint)]"
          : "border-slate-200 bg-white"
      }`}
    >
      <span className="text-sm font-semibold text-slate-950">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-600">
        {description}
      </span>
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal text-slate-900"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 rounded-xl border border-slate-200 px-3 text-sm font-normal normal-case tracking-normal text-slate-900"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case tracking-normal text-slate-900"
      >
        {options.map(([option, optionLabel]) => (
          <option key={option} value={option}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function formatVariables(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value && typeof value === "object") return Object.keys(value).join(", ");
  return "";
}

function pretty(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (v) => v.toUpperCase());
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}
