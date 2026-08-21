"use client";

import { useCallback, useEffect, useState } from "react";

export type TenantReadinessCheck = {
  key: string;
  label: string;
  severity: "OK" | "WARNING" | "BLOCKER";
  message: string;
};

export type TenantReadiness = {
  status: "READY" | "WARNINGS" | "BLOCKED";
  blockerCount: number;
  warningCount: number;
  checks: TenantReadinessCheck[];
};

export type TenantIdentity = {
  id: string;
  identityType: "TENANT_OWNER" | "SERVICE_ACCOUNT";
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  isActive: boolean;
  isPrimaryOwner: boolean;
  isServiceAccount: boolean;
  purpose: string | null;
  invitationStatus: string;
  invitationExpiresAt: string | null;
  lastSignInAt: string | null;
  credentialRotatedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  roles: Array<{ id: string; key: string; name: string }>;
};

export type TenantAccessView = {
  tenantId: string;
  primaryOwnerUserId: string | null;
  owners: TenantIdentity[];
  serviceAccounts: TenantIdentity[];
  activeOwnerCount: number;
};

export type TenantModule = {
  key: string;
  label: string;
  description: string;
  categoryKey: string;
  categoryLabel: string;
  isIncludedInPlan: boolean;
  tenantOverride: boolean | null;
  effectiveEnabled: boolean;
  state:
    | "ENABLED_BY_PLAN"
    | "DISABLED_BY_PLAN"
    | "ENABLED_BY_OVERRIDE"
    | "DISABLED_BY_OVERRIDE"
    | "BLOCKED_BY_PLAN";
  canEnable: boolean;
};

export type TenantModulesView = {
  plan: { id: string; key: string; name: string } | null;
  planEntitlementActive: boolean;
  subscriptionStatus: string | null;
  modules: TenantModule[];
  enabledCount: number;
  overrideCount: number;
  totalCount: number;
};

export type TenantRelease = {
  id: string;
  version: string;
  name: string;
  channel: string;
  platform: string;
  architecture: string;
  releaseNotes: string | null;
  publishedAt: string | null;
};

export type TenantApp = {
  appKey: string;
  name: string;
  channelType: "CLOUD" | "DESKTOP" | "ON_PREMISE";
  description: string;
  hasReleases: boolean;
  requiresFeatureKey: string | null;
  isAssigned: boolean;
  isEnabled: boolean;
  channel: string;
  updatePolicy: "AUTOMATIC" | "MANUAL" | "PINNED";
  minimumVersion: string | null;
  notes: string | null;
  assignedRelease: TenantRelease | null;
  latestRelease: TenantRelease | null;
  installedVersions: Array<{ version: string; count: number }>;
  installationCount: number;
  lastSeenAt: string | null;
  updateStatus: string;
  healthStatus: string;
};

export type TenantGateway = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  version: string | null;
  host: string | null;
  lastHeartbeatAt: string | null;
  lastSyncAt: string | null;
  lastSuccessfulUploadAt: string | null;
  pendingQueueCount: number | null;
  oldestPendingEventAt: string | null;
  connectedDeviceCount: number;
  integrationCount: number;
  registeredAt: string | null;
  connectionHealth: string;
};

export type TenantAppsView = {
  apps: TenantApp[];
  gateways: TenantGateway[];
  updatesAvailable: number;
};

export type TenantInstallation = {
  id: string;
  deviceName: string;
  os: string;
  platform: string;
  version: string;
  assignedTo: string | null;
  lastSeenAt: string | null;
  isActive: boolean;
  updateStatus: string;
};

export type TenantProvisioningStep = {
  id: string;
  key: string;
  label: string;
  sequence: number;
  status: string;
  isRetryable: boolean;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  message: string | null;
};

export type TenantOperationsView = {
  provisioning: {
    status: string | null;
    hasRecordedRuns: boolean;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    attempt: number | null;
    failedStepKey: string | null;
    message: string | null;
    /**
     * The run as an operator experiences it, derived on the API from the same
     * function the provisioning queue uses. `status` alone cannot tell a live
     * run from one whose process died holding it.
     */
    operationalState:
      | "IN_PROGRESS"
      | "AT_RISK"
      | "BREACHED"
      | "STALLED"
      | "MANUAL_ACTION_REQUIRED"
      | "FAILED"
      | "READY"
      | null;
    /** What to do next, in a sentence. Null when there is nothing to do. */
    recommendedAction: string | null;
    canRetry: boolean;
    retryBlockedReason: string | null;
    onboarding: {
      id: string;
      status: string;
      subStatus: string | null;
      customer: { id: string; companyName: string } | null;
    } | null;
  };
  provisioningRuns: Array<{
    id: string;
    trigger: string;
    attempt: number;
    status: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    failedStepKey: string | null;
    message: string | null;
    steps: TenantProvisioningStep[];
  }>;
  supportCases: Array<{
    id: string;
    caseNumber: string;
    title: string;
    status: string;
    priority: string;
    severity: string;
    resolutionDueAt: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }>;
  openSupportCaseCount: number;
  jobs: {
    byStatus: Array<{ status: string; count: number }>;
    failedCount: number;
    runningCount: number;
  };
};

export type TenantOverview = {
  header: {
    eyebrow: string;
    title: string;
    status: string;
    statusReason: string | null;
    plan: string | null;
    billingCycle: string | null;
    customer: { id: string; name: string; href: string } | null;
    workspaceUrl: string | null;
    workspaceDomain: string | null;
    createdAt: string;
  };
  readiness: TenantReadiness;
  summary: {
    tenantStatus: string;
    statusReason: string | null;
    tenantAccessBlocked: boolean;
    workspace: {
      slug: string;
      url: string | null;
      domain: string | null;
      verificationStatus: string | null;
      sslStatus: string | null;
      verifiedAt: string | null;
    };
    subscription: {
      id: string;
      plan: { id: string; key: string; name: string };
      status: string;
      billingCycle: string;
      currency: string;
      finalPrice: number;
      startDate: string;
      endDate: string | null;
      renewalDate: string | null;
      autoRenew: boolean;
      purchasedSeats: number;
    } | null;
    owners: {
      total: number;
      active: number;
      primary: TenantIdentity | null;
    };
    serviceAccountCount: number;
    modules: { enabled: number; total: number; overrides: number };
    apps: {
      assigned: number;
      updatesAvailable: number;
      gatewayCount: number;
      gatewaysOnline: number;
    };
    provisioning: TenantOperationsView["provisioning"];
    openSupportCaseCount: number;
    failedJobCount: number;
    lastActivity: { action: string; occurredAt: string } | null;
  };
  counts: {
    users: number;
    employees: number;
    organizations: number;
    businessUnits: number;
  };
  customer: {
    id: string;
    companyName: string;
    legalCompanyName: string | null;
    status: string;
    contactEmail: string;
    primaryContactName: string;
  } | null;
  attribution: {
    originatingLead: { id: string; label: string; status: string } | null;
    originatingPartner: { id: string; label: string; status: string } | null;
    referralCodeSnapshot: string | null;
  };
  system: {
    createdAt: string;
    updatedAt: string;
    createdByName: string | null;
    updatedByName: string | null;
    isDemoData: boolean;
    demoBatchId: string | null;
    seedSource: string | null;
  };
  availableTransitions: string[];
};

export type TenantCommercialView = {
  subscription: {
    id: string;
    plan: { id: string; key: string; name: string };
    status: string;
    billingCycle: string;
    currency: string;
    basePrice: number;
    finalPrice: number;
    discountType: string;
    discountValue: number;
    startDate: string;
    endDate: string | null;
    renewalDate: string | null;
    autoRenew: boolean;
    purchasedSeats: number;
    seatsLastReconciledAt: string | null;
  } | null;
  seatUsage: { purchased: number; assigned: number } | null;
  agreements: Array<{
    id: string;
    contractNumber: string;
    title: string;
    contractType: string;
    status: string;
    effectiveDate: string | null;
    expiryDate: string | null;
    counterpartyName: string;
    signedAt: string | null;
    activatedAt: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    currency: string;
    amount: number;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    periodStart: string | null;
    periodEnd: string | null;
    dueDate: string;
    paidAt: string | null;
    amountDue: number | null;
  }>;
};

export type TenantConfigurationView = {
  workspace: {
    id: string;
    name: string;
    displayName: string;
    legalName: string | null;
    tenantCode: string | null;
    slug: string;
    status: string;
    subStatus: string | null;
    environmentType: string;
    environmentGroupName: string | null;
    workspaceUrl: string | null;
    editableFields: string[];
    domains: Array<{
      id: string;
      domain: string;
      type: string;
      isPrimary: boolean;
      verificationStatus: string;
      tlsStatus: string | null;
      verifiedAt: string | null;
    }>;
  };
  localization: {
    readOnly: boolean;
    source: string;
    values: Record<string, string>;
  };
  customerRelationship: {
    customer: TenantOverview["customer"];
    originatingLead: { id: string; label: string; status: string } | null;
    originatingPartner: { id: string; label: string; status: string } | null;
    referralCode: string | null;
  };
};

export type TenantTimelineItem = {
  id: string;
  source: "AUDIT" | "PLATFORM_EVENT";
  action: string;
  actionLabel: string;
  category: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  actorName: string;
  occurredAt: string;
};

export type TenantSystemView = {
  identifiers: Record<string, string | null>;
  record: TenantOverview["system"] & {
    createdById: string | null;
    updatedById: string | null;
  };
  provisioning: {
    provisionedAt: string | null;
    status: string | null;
    attempts: number | null;
  };
  erasureReceipts: Array<{
    id: string;
    status: string;
    reason: string;
    requestedByName: string | null;
    requestedAt: string;
    completedAt: string | null;
    failureMessage: string | null;
    /*
     * On a FAILED receipt this holds the diagnosis rather than counts — the
     * phase, model and constraint that refused. It is the only surviving record
     * of why an erasure did not run, and the error shown at the time did not
     * always name any of it.
     */
    erasedRecordCounts: Record<string, unknown> | null;
  }>;
};

export type TenantErasurePreflight = {
  tenant: {
    id: string;
    name: string;
    displayName: string;
    slug: string;
    tenantCode: string | null;
    status: string;
  };
  customer: { id: string; companyName: string } | null;
  confirmationPhrase: string;
  blockers: string[];
  warnings: string[];
  requiresBillingAcknowledgement: boolean;
  impact: {
    employees: number;
    users: number;
    documents: number;
    payrollRuns: number;
    unpaidInvoices: number;
  };
  retained: { contracts: number; supportCases: number };
};

/**
 * An API failure with the context needed to chase it.
 *
 * The API's error envelope already carries a trace id, an error code and a
 * support reference; reducing it to `message` on the way in threw away the only
 * things that let someone find the corresponding server log. Everything is kept
 * here, and `describe()` renders the part an operator should quote.
 */
export class TenantControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly traceId?: string,
    readonly errorCode?: string,
    readonly description?: string,
    readonly fieldErrors?: Array<{ field?: string; message: string }>,
  ) {
    super(message);
    this.name = "TenantControlPlaneError";
  }

  /** The message plus its reference, for display next to a failed action. */
  describe() {
    const reference = this.traceId ? ` (reference ${this.traceId})` : "";
    return `${this.message}${reference}`;
  }
}

export async function tenantRequest<T>(
  tenantId: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `/api/platform/tenants/${encodeURIComponent(tenantId)}${path}`,
    {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = (payload ?? {}) as {
      message?: unknown;
      traceId?: unknown;
      errorCode?: unknown;
      description?: unknown;
      fieldErrors?: Array<{ field?: string; message: string }>;
      support?: { reference?: unknown };
    };
    /*
     * The global validation pipe returns `message` as an array of field errors.
     * Joining them keeps every failed rule visible instead of showing "[object
     * Object]" or only the first one.
     */
    const message = Array.isArray(envelope.message)
      ? (envelope.message as string[]).join(" ")
      : typeof envelope.message === "string" && envelope.message
        ? envelope.message
        : "The tenant control plane request failed.";
    const error = new TenantControlPlaneError(
      message,
      response.status,
      typeof envelope.traceId === "string"
        ? envelope.traceId
        : typeof envelope.support?.reference === "string"
          ? envelope.support.reference
          : undefined,
      typeof envelope.errorCode === "string" ? envelope.errorCode : undefined,
      typeof envelope.description === "string"
        ? envelope.description
        : undefined,
      envelope.fieldErrors,
    );
    /*
     * Also logged client-side. A failed control-plane action is rare and
     * consequential, and the browser console is where a developer looks first.
     */
    console.error("Tenant control plane request failed", {
      path,
      method: init?.method ?? "GET",
      status: response.status,
      errorCode: error.errorCode,
      traceId: error.traceId,
      message: error.message,
    });
    throw error;
  }
  return payload as T;
}

/**
 * Load one tab's data.
 *
 * Every tab owns its own request and is only fired when that tab is opened, so
 * arriving on Overview does not pull Commercial, Apps and Operations with it.
 * The four states a data surface has to have — loading, error with retry, empty
 * and loaded — are all represented here rather than left to each panel.
 */
export function useTenantResource<T>(
  tenantId: string,
  path: string,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    /*
     * Loading starts true from the initialiser and is set again by `reload`,
     * which runs from an event handler. Setting it here as well would be a
     * synchronous state write inside an effect — a cascading render for no
     * behavioural gain, since the flag is already correct on entry.
     */
    tenantRequest<T>(tenantId, path)
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(describeError(reason, "Unable to load this section."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tenantId, path, enabled, reloadToken]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);
  return { data, loading, error, reload, setData };
}

/**
 * One place that turns any thrown value into text worth showing, including the
 * trace reference when the API supplied one.
 */
/**
 * Erasure receipts for one tenant, read without addressing the tenant itself.
 *
 * Deliberately not routed through `tenantRequest`: after a successful erasure
 * the tenant no longer exists, and the receipt is the only record that can say
 * what happened. It is the authority the UI reconciles against when a response
 * goes missing.
 */
export async function fetchErasureReceipts(tenantId: string) {
  const response = await fetch(
    `/api/platform/tenants/erasure-receipts?tenantId=${encodeURIComponent(tenantId)}`,
  );
  if (!response.ok) return null;
  const payload: unknown = await response.json().catch(() => null);
  return Array.isArray(payload)
    ? (payload as Array<{
        id: string;
        status: "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
        failureMessage: string | null;
        requestedAt: string;
      }>)
    : null;
}

/**
 * Whether a failure means "the request never got an answer" rather than "the
 * server said no". Only the former leaves the outcome genuinely unknown.
 */
export function isTransportFailure(reason: unknown) {
  if (reason instanceof TenantControlPlaneError) {
    return [502, 503, 504].includes(reason.status);
  }
  return reason instanceof TypeError;
}

export function describeError(reason: unknown, fallback: string) {
  if (reason instanceof TenantControlPlaneError) return reason.describe();
  if (reason instanceof Error) return reason.message;
  return fallback;
}

export type ErasureReconciliation = { erased: boolean; message: string };

/**
 * Ask the receipt what happened when the response did not arrive.
 *
 * Erasure runs in one long transaction behind a proxy, so a 502 or a dropped
 * connection can arrive after the work has already committed. Reporting that as
 * a failure when the tenant is gone is worse than reporting nothing. The receipt
 * is written before anything is deleted and outlives the tenant, so it is the
 * only thing that can distinguish the three situations an operator can be in:
 * it worked, it failed for a stated reason, or it never started.
 */
export async function reconcileWithErasureReceipt(
  tenantId: string,
): Promise<ErasureReconciliation> {
  const receipts = await fetchErasureReceipts(tenantId).catch(() => null);
  if (!receipts) {
    return {
      erased: false,
      message:
        "The API did not answer, and the erasure receipts could not be read either. Check that the API is running, then re-open this dialog — the receipt will show whether the erasure ran.",
    };
  }

  const latest = receipts[0];
  if (!latest) {
    return {
      erased: false,
      message:
        "The API did not answer and no erasure was recorded, so nothing was deleted. This is safe to retry once the API is reachable.",
    };
  }
  if (latest.status === "COMPLETED") {
    return {
      erased: true,
      message: "The erasure completed. The tenant no longer exists.",
    };
  }
  if (latest.status === "FAILED") {
    return {
      erased: false,
      message: `The erasure failed and nothing was deleted: ${
        latest.failureMessage ?? "no reason was recorded"
      }`,
    };
  }
  return {
    erased: false,
    message:
      "The erasure is still running. Re-open this dialog in a moment; the receipt will show the outcome.",
  };
}
