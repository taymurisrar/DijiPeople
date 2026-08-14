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
    workspaceUrl: string | null;
    editableFields: string[];
    domains: Array<{
      id: string;
      domain: string;
      type: string;
      isPrimary: boolean;
      verificationStatus: string;
      sslStatus: string | null;
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

export class TenantControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TenantControlPlaneError";
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
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : "The tenant control plane request failed.";
    throw new TenantControlPlaneError(message, response.status);
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
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load this section.",
        );
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
