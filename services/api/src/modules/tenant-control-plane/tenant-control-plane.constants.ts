import { TenantStatus } from '@prisma/client';
import { APP_KEYS } from '../app-releases/app-release.service';

/**
 * The tenant lifecycle, expressed as the transitions Platform Admin is allowed
 * to drive directly.
 *
 * Only operator-driven moves live here. Provisioning drives PROVISIONING →
 * ACTIVE / PROVISIONING_FAILED itself, and erasure removes the row rather than
 * moving it, so neither appears as a transition an operator can request.
 *
 * This is the server-side authority. The action menu hides transitions that are
 * invalid for the current state, but hiding a button is a usability affordance —
 * every request is re-checked here.
 */
export const TENANT_STATUS_TRANSITIONS: Record<TenantStatus, TenantStatus[]> = {
  [TenantStatus.ONBOARDING]: [
    TenantStatus.PENDING_SETUP,
    TenantStatus.ACTIVE,
    TenantStatus.INACTIVE,
    TenantStatus.ARCHIVED,
  ],
  [TenantStatus.PENDING_SETUP]: [
    TenantStatus.ACTIVE,
    TenantStatus.SUSPENDED,
    TenantStatus.INACTIVE,
    TenantStatus.ARCHIVED,
  ],
  [TenantStatus.PROVISIONING]: [TenantStatus.PROVISIONING_FAILED],
  [TenantStatus.PROVISIONING_FAILED]: [
    TenantStatus.PENDING_SETUP,
    TenantStatus.ARCHIVED,
  ],
  [TenantStatus.ACTIVE]: [
    TenantStatus.SUSPENDED,
    TenantStatus.INACTIVE,
    TenantStatus.DECOMMISSIONING,
  ],
  [TenantStatus.SUSPENDED]: [
    TenantStatus.ACTIVE,
    TenantStatus.INACTIVE,
    TenantStatus.DECOMMISSIONING,
  ],
  [TenantStatus.INACTIVE]: [
    TenantStatus.ACTIVE,
    TenantStatus.SUSPENDED,
    TenantStatus.DECOMMISSIONING,
  ],
  [TenantStatus.DECOMMISSIONING]: [
    TenantStatus.DECOMMISSIONED,
    TenantStatus.ACTIVE,
  ],
  [TenantStatus.DECOMMISSIONED]: [TenantStatus.ARCHIVED],
  [TenantStatus.ARCHIVED]: [TenantStatus.CHURNED],
  [TenantStatus.CHURNED]: [],
};

/** Statuses where ordinary tenant sign-in is refused by the auth stack. */
export const TENANT_ACCESS_BLOCKED_STATUSES: TenantStatus[] = [
  TenantStatus.ONBOARDING,
  TenantStatus.PENDING_SETUP,
  TenantStatus.PROVISIONING,
  TenantStatus.PROVISIONING_FAILED,
  TenantStatus.INACTIVE,
  TenantStatus.SUSPENDED,
  TenantStatus.DECOMMISSIONING,
  TenantStatus.DECOMMISSIONED,
  TenantStatus.ARCHIVED,
  TenantStatus.CHURNED,
];

/** Statuses a retryable provisioning run can be resumed from. */
export const TENANT_RETRYABLE_STATUSES: TenantStatus[] = [
  TenantStatus.PROVISIONING_FAILED,
  TenantStatus.PROVISIONING,
  TenantStatus.ONBOARDING,
  TenantStatus.PENDING_SETUP,
];

export type TenantProvisioningStepDefinition = {
  key: string;
  label: string;
  sequence: number;
  /**
   * Whether replaying this step on its own is safe.
   *
   * Every step except `tenant-record` is anchored on something the database
   * already makes unique, so replaying it converges rather than duplicating.
   * `tenant-record` stays non-retryable because by the time a retry runs the
   * tenant row is the thing being retried — re-creating it would produce a
   * rival workspace, not a repaired one.
   */
  isRetryable: boolean;
  description: string;
};

export const TENANT_PROVISIONING_STEPS: TenantProvisioningStepDefinition[] = [
  {
    key: 'tenant-record',
    label: 'Tenant record',
    sequence: 1,
    isRetryable: false,
    description: 'Create the tenant row, code and default branding.',
  },
  {
    key: 'workspace-slug-reserved',
    label: 'Workspace slug reserved',
    sequence: 2,
    isRetryable: true,
    description:
      'Confirm the workspace slug is well formed, unreserved and globally unique.',
  },
  {
    key: 'workspace-domain',
    label: 'System domain created',
    sequence: 3,
    isRetryable: true,
    description:
      'Issue the workspace subdomain under the platform wildcard and make it primary.',
  },
  {
    key: 'rbac-defaults',
    label: 'Roles and permissions',
    sequence: 4,
    isRetryable: true,
    description: 'Bootstrap the tenant role set and permission matrix.',
  },
  {
    key: 'identities-and-billing',
    label: 'Owner, service account and subscription',
    sequence: 5,
    /*
     * Was false, and that made every tenant failing at or before it permanently
     * unrecoverable: this is the only step that creates the business unit, the
     * owner and the subscription, and `POST /access` refuses to add an owner to
     * a tenant with no business unit. Retry skipped it, reported SUCCEEDED and
     * left a tenant that could never be activated — BUG-0015.
     *
     * `TenantIdentitiesProvisioningService` now find-or-creates against
     * `User @@unique([tenantId, email])`, upserts the subscription on
     * `Subscription.tenantId @unique`, and raises the first invoice only when
     * the subscription has none. A replay adds no second owner, no second
     * subscription and no second invoice.
     */
    isRetryable: true,
    description:
      'Create the tenant owner, optional service account, subscription and first invoice.',
  },
  {
    key: 'customization-defaults',
    label: 'Default views and forms',
    sequence: 6,
    isRetryable: true,
    description: 'Publish the tenant customization defaults.',
  },
  {
    key: 'workspace-routing-verified',
    label: 'Workspace routing verified',
    sequence: 7,
    isRetryable: true,
    description:
      'Confirm the workspace hostname resolves to this tenant through the domain resolver.',
  },
  {
    key: 'invitations',
    label: 'Owner invitation sent',
    sequence: 8,
    isRetryable: true,
    description:
      'Issue activation invitations, addressed to the workspace URL.',
  },
];

export type TenantAppDefinition = {
  appKey: string;
  name: string;
  /** How the app reaches the tenant. Drives which telemetry is meaningful. */
  channelType: 'CLOUD' | 'DESKTOP' | 'ON_PREMISE';
  description: string;
  /**
   * Whether ApplicationRelease carries downloadable artefacts for this app.
   * The hosted web product has no installer, so version management does not
   * apply to it.
   */
  hasReleases: boolean;
  /** Tenant feature key that must be enabled for the app to be useful. */
  requiresFeatureKey?: string;
};

/**
 * DijiPeople applications a tenant can be assigned.
 *
 * Platform Admin itself is not here: it is DijiPeople's own console, not
 * something a tenant runs. The landing site is not here either — it is public
 * marketing, not tenant-installed software.
 */
export const TENANT_APP_CATALOG: TenantAppDefinition[] = [
  {
    appKey: 'DIJIPEOPLE_WEB',
    name: 'DijiPeople Web',
    channelType: 'CLOUD',
    description:
      'The hosted tenant product. Served from the workspace URL and always current.',
    hasReleases: false,
  },
  {
    appKey: APP_KEYS.AGENT_DESKTOP,
    name: 'Attendance Desktop Agent',
    channelType: 'DESKTOP',
    description:
      'Installed per employee device. Reports work sessions and activity to attendance.',
    hasReleases: true,
    requiresFeatureKey: 'attendance',
  },
  {
    appKey: APP_KEYS.INTEGRATION_GATEWAY,
    name: 'Attendance Gateway',
    channelType: 'ON_PREMISE',
    description:
      'On-premise Windows service that reaches attendance devices DijiPeople cannot reach from the cloud.',
    hasReleases: true,
    requiresFeatureKey: 'attendance',
  },
];

export function findTenantApp(appKey: string) {
  return TENANT_APP_CATALOG.find((app) => app.appKey === appKey) ?? null;
}
