"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SectionCard } from "@/app/components/ui/section-card";
import type {
  ApiFieldError,
  DeviceDetail,
  IntegrationSummary,
} from "../../_lib/types";

/**
 * Device create/edit form.
 *
 * Provider is deliberately NOT an editable field. It is inherited from the
 * chosen integration on the server, so the form cannot produce a device whose
 * manufacturer contradicts the connector that has to talk to it.
 */
export function DeviceForm({
  device,
  integrations,
  workSites,
  gateways,
}: {
  device?: DeviceDetail;
  integrations: IntegrationSummary[];
  workSites: Array<{ id: string; name: string }>;
  gateways: Array<{ id: string; name: string; isPaired: boolean }>;
}) {
  const router = useRouter();
  const isEdit = Boolean(device);

  const [integrationId, setIntegrationId] = useState(
    device?.integration?.id ?? "",
  );
  const [name, setName] = useState(device?.name ?? "");
  const [code, setCode] = useState(device?.code ?? "");
  const [model, setModel] = useState(device?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(device?.serialNumber ?? "");
  const [macAddress, setMacAddress] = useState(device?.macAddress ?? "");
  const [locationId, setLocationId] = useState(device?.workSite?.id ?? "");
  const [gatewayId, setGatewayId] = useState(device?.gateway?.id ?? "");
  const [host, setHost] = useState(device?.host ?? "");
  const [port, setPort] = useState(device?.port ? String(device.port) : "");
  const [machineNumber, setMachineNumber] = useState(
    device?.machineNumber !== null && device?.machineNumber !== undefined
      ? String(device.machineNumber)
      : "",
  );
  const [timezone, setTimezone] = useState(device?.timezone ?? "");
  const [directionMode, setDirectionMode] = useState(
    device?.directionMode ?? "BOTH",
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedIntegration = integrations.find(
    (item) => item.id === integrationId,
  );

  async function save() {
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const payload: Record<string, unknown> = {
      name: name.trim(),
      ...(code.trim() ? { code: code.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
      ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
      ...(macAddress.trim() ? { macAddress: macAddress.trim() } : {}),
      ...(locationId ? { locationId } : {}),
      ...(gatewayId ? { gatewayId } : {}),
      ...(host.trim() ? { host: host.trim() } : {}),
      ...(port.trim() ? { port: Number(port) } : {}),
      ...(machineNumber.trim() ? { machineNumber: Number(machineNumber) } : {}),
      ...(timezone.trim() ? { timezone: timezone.trim() } : {}),
      directionMode,
    };

    if (!isEdit) {
      payload.integrationId = integrationId;
    }

    try {
      const response = await fetch(
        isEdit
          ? `/api/integrations/attendance/devices/${device!.id}`
          : "/api/integrations/attendance/devices",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        const parsed = body as
          | { message?: string; errors?: ApiFieldError[] }
          | undefined;
        if (parsed?.errors?.length) {
          const mapped: Record<string, string> = {};
          for (const issue of parsed.errors) mapped[issue.field] = issue.message;
          setFieldErrors(mapped);
        }
        setError(parsed?.message ?? "The device could not be saved.");
        return;
      }

      const saved = body as { id: string };
      router.push(`/settings/integrations/attendance/devices/${saved.id}`);
      router.refresh();
    } catch {
      setError("The device could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <div
          className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <SectionCard
        title="Device"
        description="Which integration this device belongs to, and how to identify it."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Integration" required error={fieldErrors.integrationId}>
            <select
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground disabled:bg-surface-strong"
              value={integrationId}
              // Moving a device between integrations would change the connector
              // that has to speak to it, so it is fixed after creation.
              disabled={isEdit}
              onChange={(event) => setIntegrationId(event.target.value)}
            >
              <option value="">Select an integration…</option>
              {integrations.map((integration) => (
                <option key={integration.id} value={integration.id}>
                  {integration.name}
                </option>
              ))}
            </select>
            {isEdit ? (
              <p className="mt-1 text-xs text-muted">
                An existing device cannot be moved to another integration.
              </p>
            ) : null}
          </Field>

          <Field label="Manufacturer">
            <input
              className="w-full rounded-2xl border border-border bg-surface-strong px-3 py-2 text-sm text-muted"
              value={
                selectedIntegration?.provider ?? device?.provider ?? "—"
              }
              readOnly
              disabled
            />
            <p className="mt-1 text-xs text-muted">
              Taken from the integration.
            </p>
          </Field>

          <Field label="Name" required error={fieldErrors.name}>
            <input
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={name}
              placeholder="Reception terminal"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field label="Reference code">
            <input
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>

          <Field label="Model">
            <input
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={model}
              placeholder="K50"
              onChange={(event) => setModel(event.target.value)}
            />
          </Field>

          <Field label="Serial number">
            <input
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
            />
          </Field>

          <Field label="MAC address">
            <input
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              placeholder="00:00:00:00:00:00"
              value={macAddress}
              onChange={(event) => setMacAddress(event.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Location and connection"
        description="Where the device is, and how the gateway reaches it."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Work site" error={fieldErrors.locationId}>
            <select
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Not assigned</option>
              {workSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Employees authorised for this work site may use this device.
            </p>
          </Field>

          <Field label="Gateway" error={fieldErrors.gatewayId}>
            <select
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={gatewayId}
              onChange={(event) => setGatewayId(event.target.value)}
            >
              <option value="">Use the integration&rsquo;s gateway</option>
              {gateways.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.name}
                  {gateway.isPaired ? "" : " (not paired yet)"}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Address" error={fieldErrors.host}>
            <input
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={host}
              placeholder="192.168.1.50"
              onChange={(event) => setHost(event.target.value)}
            />
          </Field>

          <Field label="Port" error={fieldErrors.port}>
            <input
              type="number"
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={port}
              placeholder="4370"
              onChange={(event) => setPort(event.target.value)}
            />
          </Field>

          <Field label="Device ID" error={fieldErrors.machineNumber}>
            <input
              type="number"
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={machineNumber}
              placeholder="1"
              onChange={(event) => setMachineNumber(event.target.value)}
            />
          </Field>

          <Field label="Timezone">
            <input
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={timezone}
              placeholder="Asia/Qatar"
              onChange={(event) => setTimezone(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted">
              Terminals report wall-clock times with no timezone. Set this so
              punches can be resolved.
            </p>
          </Field>

          <Field label="Records">
            <select
              className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
              value={directionMode}
              onChange={(event) =>
                setDirectionMode(event.target.value as typeof directionMode)
              }
            >
              <option value="BOTH">Entry and exit</option>
              <option value="ENTRY">Entry only</option>
              <option value="EXIT">Exit only</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
          disabled={saving || !name.trim() || (!isEdit && !integrationId)}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add device"}
        </button>
        <button
          type="button"
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
          onClick={() => router.back()}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
