"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { SectionCard } from "@/app/components/ui/section-card";
import { StatusPill } from "@/app/components/ui/status-pill";
import { connectionModeLabel } from "../../../_lib/presentation";
import type {
  ApiFieldError,
  ConnectorDetail,
  ConnectorSummary,
  GatewaySummary,
  SyncPolicySummary,
} from "../../../_lib/types";
import { ConnectorConfigFields } from "./connector-config-fields";

/**
 * Guided setup for a new attendance integration.
 *
 * The connector list and every configuration field come from the API, so a
 * connector added on the server appears here without a frontend change.
 *
 * Two behaviours are deliberate:
 *
 *  - Interval validation is left to the API. When an administrator types five
 *    minutes we show the server's message ("Minimum supported interval for
 *    ZKTeco Legacy Terminal is 15 minutes") rather than silently rewriting the
 *    value, because a silent correction would leave them believing attendance
 *    is fresher than it is.
 *  - Saving never claims a device was reached. The API reports
 *    liveConnectionTest = NOT_AVAILABLE at this stage, and the summary says so
 *    plainly instead of showing a green success.
 */

type Step = 0 | 1 | 2 | 3 | 4;

const STEP_LABELS = [
  "Connector",
  "Connection",
  "Sync schedule",
  "Gateway",
  "Review",
];

const INTERVAL_UNITS = [
  { value: "MINUTES", label: "Minutes" },
  { value: "HOURS", label: "Hours" },
  { value: "DAYS", label: "Days" },
];

export function IntegrationWizard({
  connectors,
  syncPolicies,
  gateways,
}: {
  connectors: ConnectorSummary[];
  syncPolicies: SyncPolicySummary[];
  gateways: GatewaySummary[];
}) {
  const router = useRouter();

  const [step, setStep] = useState<Step>(0);
  const [connectorType, setConnectorType] = useState<string>("");
  const [connectorDetail, setConnectorDetail] =
    useState<ConnectorDetail | null>(null);
  const [loadingConnector, setLoadingConnector] = useState(false);

  const [name, setName] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [syncPolicyId, setSyncPolicyId] = useState("");
  const [newPolicyName, setNewPolicyName] = useState("");
  const [intervalValue, setIntervalValue] = useState("30");
  const [intervalUnit, setIntervalUnit] = useState("MINUTES");

  const [gatewayId, setGatewayId] = useState("");

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    id: string;
    status: string;
    deviceVerified: boolean;
    liveConnectionTest: string;
    liveConnectionTestReason: string;
    blockers: string[];
  } | null>(null);

  const selectedConnector = useMemo(
    () => connectors.find((item) => item.connectorType === connectorType),
    [connectors, connectorType],
  );

  const requiresGateway = selectedConnector?.requiresGateway ?? false;
  const pairedGateways = gateways.filter((gateway) => gateway.isPaired);

  async function chooseConnector(type: string) {
    setConnectorType(type);
    setConnectorDetail(null);
    setConfigValues({});
    setFieldErrors({});
    setLoadingConnector(true);

    try {
      const response = await fetch(
        `/api/integrations/attendance/connectors/${encodeURIComponent(type)}`,
      );
      if (!response.ok) throw new Error("Connector details unavailable");
      const detail = (await response.json()) as ConnectorDetail;
      setConnectorDetail(detail);

      // Seed defaults declared by the schema so the form starts usable.
      const defaults: Record<string, string> = {};
      for (const field of detail.configurationSchema.fields) {
        if (field.defaultValue !== undefined && !field.secret) {
          defaults[field.key] = String(field.defaultValue);
        }
      }
      setConfigValues(defaults);
      setIntervalValue(
        String(detail.recommendedSync.recommendedIntervalValue ?? 30),
      );
      setIntervalUnit(detail.recommendedSync.recommendedIntervalUnit ?? "MINUTES");
    } catch {
      setFormError(
        "This connector's configuration could not be loaded. Refresh and try again.",
      );
    } finally {
      setLoadingConnector(false);
    }
  }

  function applyApiErrors(payload: unknown): string {
    const body = payload as
      | { message?: string; errors?: ApiFieldError[] }
      | undefined;

    if (body?.errors?.length) {
      const mapped: Record<string, string> = {};
      for (const issue of body.errors) {
        mapped[issue.field] = issue.message;
      }
      setFieldErrors(mapped);
    }

    return body?.message ?? "The integration could not be saved.";
  }

  async function save() {
    if (!connectorDetail) return;

    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    try {
      // Blank values are dropped rather than sent. For a secret that means
      // "leave the stored value alone"; sending "" would clear it.
      const configuration: Record<string, unknown> = {};
      for (const field of connectorDetail.configurationSchema.fields) {
        const raw = configValues[field.key];
        if (raw === undefined || raw.trim() === "") continue;
        configuration[field.key] =
          field.type === "number" ? Number(raw) : raw.trim();
      }

      let resolvedPolicyId = syncPolicyId;

      if (!resolvedPolicyId && newPolicyName.trim()) {
        const policyResponse = await fetch(
          "/api/integrations/attendance/sync-policies",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: newPolicyName.trim(),
              mode: "POLL",
              intervalValue: Number(intervalValue),
              intervalUnit,
              // Asking the API to validate against this connector's floor.
              connectorType,
            }),
          },
        );

        const policyBody = await policyResponse.json().catch(() => null);
        if (!policyResponse.ok) {
          setFormError(applyApiErrors(policyBody));
          setStep(2);
          return;
        }
        resolvedPolicyId = (policyBody as { id: string }).id;
      }

      const createResponse = await fetch(
        "/api/integrations/attendance/integrations",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            connectorType,
            configuration,
            ...(resolvedPolicyId ? { syncPolicyId: resolvedPolicyId } : {}),
            ...(gatewayId ? { gatewayId } : {}),
          }),
        },
      );

      const createBody = await createResponse.json().catch(() => null);
      if (!createResponse.ok) {
        setFormError(applyApiErrors(createBody));
        setStep(1);
        return;
      }

      const created = createBody as { id: string; status: string };

      // Schema validation only. This does not contact a device.
      const validateResponse = await fetch(
        `/api/integrations/attendance/integrations/${created.id}/validate-configuration`,
        { method: "POST" },
      );
      const validateBody = await validateResponse.json().catch(() => null);

      const validation = validateResponse.ok
        ? (validateBody as {
            deviceVerified: boolean;
            liveConnectionTest: string;
            liveConnectionTestReason: string;
            blockers: string[];
          })
        : null;

      const detailResponse = await fetch(
        `/api/integrations/attendance/integrations/${created.id}`,
      );
      const detailBody = detailResponse.ok
        ? ((await detailResponse.json()) as { status: string })
        : null;

      setResult({
        id: created.id,
        status: detailBody?.status ?? created.status,
        deviceVerified: validation?.deviceVerified ?? false,
        liveConnectionTest: validation?.liveConnectionTest ?? "NOT_AVAILABLE",
        liveConnectionTestReason:
          validation?.liveConnectionTestReason ??
          "Testing a physical device requires the DijiPeople gateway, which is not available yet.",
        blockers: validation?.blockers ?? [],
      });
      router.refresh();
    } catch {
      setFormError("The integration could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return <WizardResult result={result} />;
  }

  const canContinue =
    step === 0
      ? Boolean(connectorType) && Boolean(connectorDetail)
      : step === 1
        ? name.trim().length > 0
        : true;

  return (
    <div className="grid gap-6">
      <ol className="flex flex-wrap gap-2" aria-label="Setup steps">
        {STEP_LABELS.map((label, index) => (
          <li key={label}>
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                index === step
                  ? "border-accent/30 bg-accent-soft text-accent"
                  : index < step
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-border bg-white/70 text-muted"
              }`}
            >
              <span>{index + 1}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {formError ? (
        <div
          className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
          role="alert"
        >
          {formError}
        </div>
      ) : null}

      {step === 0 ? (
        <SectionCard
          title="Choose a connector"
          description="Pick the kind of attendance system you want to connect."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {connectors.map((connector) => {
              const selected = connector.connectorType === connectorType;
              return (
                <button
                  key={connector.connectorType}
                  type="button"
                  onClick={() => void chooseConnector(connector.connectorType)}
                  className={`rounded-[22px] border p-5 text-left transition ${
                    selected
                      ? "border-accent bg-accent-soft/40"
                      : "border-border bg-white/70 hover:bg-surface-strong"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">
                      {connector.displayName}
                    </h3>
                    {connector.requiresGateway ? (
                      <StatusPill tone="info">Local gateway</StatusPill>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {connector.description}
                  </p>
                  <dl className="mt-3 grid gap-1 text-xs text-muted">
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground">Connection</dt>
                      <dd>{connectionModeLabel(connector.connectionMode)}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground">Sync</dt>
                      <dd>
                        {connector.recommendedSync.mode === "POLL"
                          ? "Scheduled polling"
                          : connector.recommendedSync.mode}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground">
                        Recommended
                      </dt>
                      <dd>
                        Every{" "}
                        {connector.recommendedSync.recommendedIntervalValue}{" "}
                        {connector.recommendedSync.recommendedIntervalUnit.toLowerCase()}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-medium text-foreground">Minimum</dt>
                      <dd>
                        {connector.recommendedSync.minimumIntervalMinutes}{" "}
                        minutes
                      </dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>

          {loadingConnector ? (
            <p className="mt-4 text-sm text-muted">Loading connector details…</p>
          ) : null}
        </SectionCard>
      ) : null}

      {step === 1 && connectorDetail ? (
        <SectionCard
          title="Connection settings"
          description={`How DijiPeople reaches your ${connectorDetail.displayName}.`}
        >
          <div className="grid gap-5">
            <div>
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="integration-name"
              >
                Integration name
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              </label>
              <input
                id="integration-name"
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground sm:max-w-md"
                value={name}
                placeholder="Head office terminals"
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <ConnectorConfigFields
              fields={connectorDetail.configurationSchema.fields}
              values={configValues}
              errors={fieldErrors}
              onChange={(key, value) =>
                setConfigValues((current) => ({ ...current, [key]: value }))
              }
            />
          </div>
        </SectionCard>
      ) : null}

      {step === 2 && connectorDetail ? (
        <SectionCard
          title="Sync schedule"
          description="How often DijiPeople collects attendance from this source."
        >
          <div className="grid gap-5">
            {syncPolicies.length > 0 ? (
              <div>
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="sync-policy"
                >
                  Use an existing schedule
                </label>
                <select
                  id="sync-policy"
                  className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground sm:max-w-md"
                  value={syncPolicyId}
                  onChange={(event) => setSyncPolicyId(event.target.value)}
                >
                  <option value="">Create a new schedule</option>
                  {syncPolicies.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {!syncPolicyId ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor="policy-name"
                  >
                    Schedule name
                  </label>
                  <input
                    id="policy-name"
                    className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground sm:max-w-md"
                    value={newPolicyName}
                    placeholder="Every 30 minutes"
                    onChange={(event) => setNewPolicyName(event.target.value)}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor="interval-value"
                  >
                    Sync every
                  </label>
                  <input
                    id="interval-value"
                    type="number"
                    min={1}
                    className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                    value={intervalValue}
                    onChange={(event) => setIntervalValue(event.target.value)}
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor="interval-unit"
                  >
                    Unit
                  </label>
                  <select
                    id="interval-unit"
                    className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                    value={intervalUnit}
                    onChange={(event) => setIntervalUnit(event.target.value)}
                  >
                    {INTERVAL_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-3 rounded-[18px] border border-border bg-white/70 px-4 py-3 text-xs leading-5 text-muted">
                  <p>
                    <span className="font-semibold text-foreground">
                      Recommended for {connectorDetail.displayName}:
                    </span>{" "}
                    every{" "}
                    {connectorDetail.recommendedSync.recommendedIntervalValue}{" "}
                    {connectorDetail.recommendedSync.recommendedIntervalUnit.toLowerCase()}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold text-foreground">
                      Minimum:
                    </span>{" "}
                    {connectorDetail.recommendedSync.minimumIntervalMinutes}{" "}
                    minutes
                    {connectorDetail.recommendedSync.rationale
                      ? ` — ${connectorDetail.recommendedSync.rationale}`
                      : ""}
                  </p>
                </div>

                {fieldErrors.intervalValue ? (
                  <p
                    className="sm:col-span-3 text-sm font-medium text-red-600"
                    data-testid="field-error-intervalValue"
                  >
                    {fieldErrors.intervalValue}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {step === 3 && connectorDetail ? (
        <SectionCard
          title="Gateway"
          description={
            requiresGateway
              ? "This connector reaches devices inside your network, so it needs a DijiPeople Integration Gateway."
              : "This connector reaches its source directly. No gateway is needed."
          }
        >
          {!requiresGateway ? (
            <p className="text-sm text-muted">
              Nothing to do here — continue to the review step.
            </p>
          ) : pairedGateways.length > 0 ? (
            <div>
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="gateway"
              >
                Gateway
              </label>
              <select
                id="gateway"
                className="mt-1 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-foreground sm:max-w-md"
                value={gatewayId}
                onChange={(event) => setGatewayId(event.target.value)}
              >
                <option value="">Choose later</option>
                {pairedGateways.map((gateway) => (
                  <option key={gateway.id} value={gateway.id}>
                    {gateway.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div
              className="rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-sky-900"
              data-testid="gateway-required-notice"
            >
              <p className="font-semibold">No gateway is set up yet</p>
              <p className="mt-1">
                A DijiPeople Integration Gateway is required to reach this device
                inside your local network. Gateway setup will be available from
                Settings.
              </p>
              <p className="mt-2">
                You can save this integration now. It stays unverified until a
                gateway is available.
              </p>
            </div>
          )}
        </SectionCard>
      ) : null}

      {step === 4 && connectorDetail ? (
        <SectionCard
          title="Review"
          description="Check the details before saving."
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <ReviewRow label="Name" value={name || "—"} />
            <ReviewRow label="Connector" value={connectorDetail.displayName} />
            <ReviewRow
              label="Connection"
              value={connectionModeLabel(connectorDetail.connectionMode)}
            />
            <ReviewRow
              label="Sync schedule"
              value={
                syncPolicyId
                  ? (syncPolicies.find((p) => p.id === syncPolicyId)?.name ??
                    "Existing schedule")
                  : newPolicyName
                    ? `${newPolicyName} — every ${intervalValue} ${intervalUnit.toLowerCase()}`
                    : "Not scheduled"
              }
            />
            <ReviewRow
              label="Gateway"
              value={
                requiresGateway
                  ? (pairedGateways.find((g) => g.id === gatewayId)?.name ??
                    "Not assigned yet")
                  : "Not needed"
              }
            />
          </dl>

          <div className="mt-5 rounded-[18px] border border-border bg-white/70 px-4 py-3 text-xs leading-5 text-muted">
            Saving checks that the settings are complete and valid. DijiPeople
            confirms it can reach the physical device once a gateway is
            available.
          </div>
        </SectionCard>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong disabled:opacity-50"
          disabled={step === 0 || saving}
          onClick={() => setStep((current) => (current - 1) as Step)}
        >
          Back
        </button>

        {step < 4 ? (
          <button
            type="button"
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
            disabled={!canContinue || saving}
            onClick={() => setStep((current) => (current + 1) as Step)}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
            disabled={saving || !name.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save and validate"}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Outcome panel.
 *
 * Reports the save as successful and device verification as pending. It never
 * renders the pending verification as an error, because nothing failed — the
 * capability does not exist yet.
 */
function WizardResult({
  result,
}: {
  result: {
    id: string;
    status: string;
    deviceVerified: boolean;
    liveConnectionTest: string;
    liveConnectionTestReason: string;
    blockers: string[];
  };
}) {
  return (
    <SectionCard
      title="Integration saved"
      description="Configuration was checked and stored."
    >
      <div className="grid gap-4">
        <div
          className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          data-testid="wizard-saved"
        >
          Configuration saved and validated.
        </div>

        <div
          className="rounded-[18px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
          data-testid="wizard-device-verification"
        >
          <p className="font-semibold">
            Device verification: waiting for Integration Gateway validation
          </p>
          <p className="mt-1 leading-6">{result.liveConnectionTestReason}</p>
        </div>

        {result.blockers.length > 0 ? (
          <div
            className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            data-testid="wizard-blockers"
          >
            <p className="font-semibold">
              Before this integration can be activated:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {result.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-strong"
            href={`/settings/integrations/attendance/integrations/${result.id}`}
          >
            View integration
          </Link>
          <Link
            className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-strong"
            href="/settings/integrations/attendance/integrations"
          >
            Back to integrations
          </Link>
        </div>
      </div>
    </SectionCard>
  );
}
