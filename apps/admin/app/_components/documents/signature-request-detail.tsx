"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ModuleActionBar } from "@/app/_components/runtime/module-action-bar";
import { RecordStatusGroup } from "@/app/_components/runtime/record-status-group";
import { getPlatformModuleDefinition } from "@/lib/runtime/platform-module-registry";
import { runStandardRecordCommand } from "@/lib/runtime/standard-record-commands";

type Item = {
  id: string;
  requestNumber: string;
  subject: string;
  message?: string;
  status: string;
  sentAt?: string;
  expiresAt?: string;
  completedAt?: string;
  contract: { id: string; contractNumber: string; title: string };
  contractVersion: { version: number; contentSha256: string };
  recipients: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    signingOrder: number;
    status: string;
    evidence?: {
      method: string;
      ipAddress?: string;
      consentAcceptedAt: string;
      documentSha256: string;
    };
  }>;
};

const moduleDefinition = getPlatformModuleDefinition("signature-requests");

export function SignatureRequestDetail({
  requestId,
  roleKeys,
  permissionKeys,
}: {
  requestId: string;
  roleKeys: string[];
  permissionKeys: string[];
}) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loadError, setLoadError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/signature-requests/${requestId}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setLoadError(payload?.message ?? "Unable to load the signature request.");
      return;
    }
    setItem(payload);
    setLoadError("");
  }, [requestId]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/signature-requests/${requestId}`, { signal: controller.signal })
      .then(async (response) => ({
        response,
        payload: await response.json().catch(() => null),
      }))
      .then(({ response, payload }) => {
        if (!response.ok) {
          setLoadError(payload?.message ?? "Unable to load the signature request.");
          return;
        }
        setItem(payload);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError")
          setLoadError("Unable to load the signature request.");
      });
    return () => controller.abort();
  }, [requestId]);

  if (!item)
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        {loadError || "Loading signature request…"}
      </div>
    );

  return (
    <main className="space-y-5">
      <ModuleActionBar
        actions={moduleDefinition.actions}
        context={{
          scope: "record",
          record: item as unknown as Record<string, unknown>,
          roleKeys,
          permissionKeys,
          mode: "read",
        }}
        onAction={async (action) => {
          const standard = await runStandardRecordCommand(action, {
            routeBase: moduleDefinition.routeBase,
            router,
            reload: load,
            reloadMessage: "Signature request refreshed.",
          });
          if (standard) return standard;
          if (action.key === "export") {
            window.print();
            return;
          }
          if (action.key === "resend" || action.key === "cancel") {
            const response = await fetch(
              `/api/signature-requests/${requestId}/${action.key}`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok)
              throw new Error(payload?.message ?? `Unable to ${action.key} the request.`);
            await load();
            return {
              success: true,
              message:
                action.key === "resend"
                  ? "New secure signing links were issued."
                  : "Signature request cancelled.",
            };
          }
        }}
      />

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {item.requestNumber}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{item.subject}</h1>
            <Link
              href={`/contracts/${item.contract.id}`}
              className="mt-1 block text-sm text-blue-700"
            >
              {item.contract.contractNumber} · {item.contract.title}
            </Link>
          </div>
          <RecordStatusGroup
            definition={moduleDefinition}
            record={item as unknown as Record<string, unknown>}
            roleKeys={roleKeys}
            permissionKeys={permissionKeys}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <Detail label="Document version" value={`Version ${item.contractVersion.version}`} />
          <Detail label="Sent" value={date(item.sentAt)} />
          <Detail label="Expires" value={date(item.expiresAt)} />
        </div>
        <p className="mt-4 break-all rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-600">
          SHA-256 {item.contractVersion.contentSha256}
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Recipients and evidence</h2>
        <div className="mt-4 space-y-3">
          {item.recipients.map((recipient) => (
            <article key={recipient.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-semibold">{recipient.signingOrder}. {recipient.name}</p>
                  <p className="text-xs text-slate-500">{recipient.email} · {recipient.role}</p>
                </div>
                <span className="text-xs font-semibold text-blue-700">{label(recipient.status)}</span>
              </div>
              {recipient.evidence ? (
                <div className="mt-3 grid gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900 sm:grid-cols-3">
                  <span>Method: {label(recipient.evidence.method)}</span>
                  <span>Consent: {date(recipient.evidence.consentAcceptedAt)}</span>
                  <span>IP: {recipient.evidence.ipAddress ?? "Unavailable"}</span>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Detail({ label: title, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value?: string) {
  return value ? new Date(value).toLocaleString() : "Not set";
}
