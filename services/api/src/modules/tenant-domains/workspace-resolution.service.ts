import { Injectable, Logger } from '@nestjs/common';
import { TenantStatus, type TenantEnvironmentType } from '@prisma/client';
import { isWorkspaceDiscoveryHostname, normalizeHostname } from '@repo/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantDomainService } from './tenant-domain.service';

/**
 * What the caller should do with a hostname.
 *
 * Every outcome is named, because "not found" and "suspended" and "still being
 * built" need three different screens. Collapsing them into a 404 tells a
 * customer whose workspace is suspended that their company does not exist.
 */
export type WorkspaceRouteOutcome =
  | 'WORKSPACE'
  | 'PLATFORM_DISCOVERY'
  | 'NOT_FOUND'
  | 'SUSPENDED'
  | 'PREPARING'
  | 'UNAVAILABLE'
  | 'REDIRECT';

export type WorkspaceRouteResult = {
  outcome: WorkspaceRouteOutcome;
  hostname: string;
  /** Present for every outcome that identifies a workspace. Never includes secrets. */
  workspace: {
    tenantId: string;
    name: string;
    slug: string;
    status: TenantStatus;
    environmentType: TenantEnvironmentType;
    isPrimaryHost: boolean;
  } | null;
  redirectToUrl: string | null;
  message: string;
};

/**
 * Lifecycle → what a visitor sees.
 *
 * A hostname resolving to a tenant is not permission to render the workspace.
 * These are the states in which it is, and what to show for the rest.
 */
const LIFECYCLE_OUTCOME: Record<TenantStatus, WorkspaceRouteOutcome> = {
  [TenantStatus.ACTIVE]: 'WORKSPACE',
  [TenantStatus.ONBOARDING]: 'PREPARING',
  [TenantStatus.PROVISIONING]: 'PREPARING',
  [TenantStatus.PENDING_SETUP]: 'PREPARING',
  [TenantStatus.PROVISIONING_FAILED]: 'PREPARING',
  [TenantStatus.SUSPENDED]: 'SUSPENDED',
  [TenantStatus.INACTIVE]: 'UNAVAILABLE',
  [TenantStatus.DECOMMISSIONING]: 'UNAVAILABLE',
  [TenantStatus.DECOMMISSIONED]: 'UNAVAILABLE',
  [TenantStatus.ARCHIVED]: 'UNAVAILABLE',
  [TenantStatus.CHURNED]: 'UNAVAILABLE',
};

const LIFECYCLE_MESSAGE: Partial<Record<WorkspaceRouteOutcome, string>> = {
  PREPARING:
    'This workspace is being prepared. It will be available once setup is complete.',
  SUSPENDED:
    'This workspace is temporarily suspended. Contact your administrator or DijiPeople support.',
  UNAVAILABLE: 'This workspace is no longer available.',
  NOT_FOUND: 'Workspace not found.',
};

@Injectable()
export class WorkspaceResolutionService {
  private readonly logger = new Logger(WorkspaceResolutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: TenantDomainService,
  ) {}

  /**
   * Resolve a hostname to a routing decision.
   *
   * Unauthenticated and safe to call from the edge: the only thing it reveals
   * about a workspace is its display name and lifecycle, which the login screen
   * has to show anyway. An unknown hostname reveals nothing at all — in
   * particular it does not say whether the name was ever associated with a
   * customer.
   */
  async resolveRoute(hostname: string): Promise<WorkspaceRouteResult> {
    const normalized = normalizeHostname(hostname);

    if (!normalized) {
      return this.notFound('');
    }

    if (isWorkspaceDiscoveryHostname(normalized)) {
      return {
        outcome: 'PLATFORM_DISCOVERY',
        hostname: normalized,
        workspace: null,
        redirectToUrl: null,
        message: 'Sign in to be taken to your workspace.',
      };
    }

    const resolution = await this.domains.resolveHostname(normalized);
    if (!resolution) {
      return this.notFound(normalized);
    }

    const workspace = {
      tenantId: resolution.tenant.id,
      name: resolution.tenant.displayName || resolution.tenant.name,
      slug: resolution.tenant.slug,
      status: resolution.tenant.status,
      environmentType: resolution.tenant.environmentType,
      isPrimaryHost: resolution.domain.isPrimary,
    };

    const outcome =
      LIFECYCLE_OUTCOME[resolution.tenant.status] ?? 'UNAVAILABLE';

    /*
     * Redirect only for a live workspace. Sending a visitor from a working
     * secondary hostname to a primary that cannot serve them would turn a
     * readable "suspended" page into a confusing hop.
     */
    if (outcome === 'WORKSPACE' && resolution.redirectToHostname) {
      return {
        outcome: 'REDIRECT',
        hostname: normalized,
        workspace,
        redirectToUrl: `https://${resolution.redirectToHostname}`,
        message: 'This workspace has moved to its primary address.',
      };
    }

    return {
      outcome,
      hostname: normalized,
      workspace,
      redirectToUrl: null,
      message:
        outcome === 'WORKSPACE'
          ? `${workspace.name} workspace.`
          : (LIFECYCLE_MESSAGE[outcome] ?? 'This workspace is unavailable.'),
    };
  }

  /**
   * The workspaces an authenticated tenant user can open.
   *
   * Returns a list even though a `User` currently belongs to exactly one tenant
   * — `User.tenantId` is a single non-null column, so one workspace is all
   * there can be today. Shaping it as a list means adding multi-workspace
   * membership later changes this method and nothing that calls it, rather than
   * every login handler.
   */
  async listWorkspacesForUser(user: AuthenticatedUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        displayName: true,
        slug: true,
        status: true,
        environmentType: true,
      },
    });

    if (!tenant) {
      return { workspaces: [], defaultWorkspace: null };
    }

    const primary = await this.domains.getPrimaryDomain(tenant.id);
    const url = await this.domains.getWorkspaceUrl(tenant.id, '/');
    const outcome = LIFECYCLE_OUTCOME[tenant.status] ?? 'UNAVAILABLE';

    const workspace = {
      tenantId: tenant.id,
      name: tenant.displayName || tenant.name,
      slug: tenant.slug,
      environmentType: tenant.environmentType,
      status: tenant.status,
      hostname: primary?.domain ?? null,
      url,
      /*
       * A suspended or half-provisioned workspace is listed but not offered as
       * somewhere to go: redirecting into it produces a login loop against a
       * tenant that refuses every session.
       */
      canOpen: outcome === 'WORKSPACE',
      unavailableReason:
        outcome === 'WORKSPACE' ? null : (LIFECYCLE_MESSAGE[outcome] ?? null),
    };

    return {
      workspaces: [workspace],
      defaultWorkspace: workspace.canOpen ? workspace : null,
    };
  }

  /**
   * Whether an authenticated user may be served on this hostname.
   *
   * The tenant is taken from the session, the tenant is taken from the hostname,
   * and they must be the same row. A valid Maseer session presented on another
   * customer's hostname is refused — the session proves who the user is, never
   * which workspace they are entitled to render.
   */
  async assertUserMayUseHostname(user: AuthenticatedUser, hostname: string) {
    const route = await this.resolveRoute(hostname);

    if (route.outcome === 'PLATFORM_DISCOVERY') {
      return { allowed: true as const, route };
    }
    if (!route.workspace) {
      return { allowed: false as const, reason: 'NOT_FOUND' as const, route };
    }
    if (route.workspace.tenantId !== user.tenantId) {
      return {
        allowed: false as const,
        reason: 'WRONG_WORKSPACE' as const,
        route,
      };
    }
    if (route.outcome !== 'WORKSPACE' && route.outcome !== 'REDIRECT') {
      return {
        allowed: false as const,
        reason: 'LIFECYCLE' as const,
        route,
      };
    }
    return { allowed: true as const, route };
  }

  private notFound(hostname: string): WorkspaceRouteResult {
    return {
      outcome: 'NOT_FOUND',
      hostname,
      workspace: null,
      redirectToUrl: null,
      message: LIFECYCLE_MESSAGE.NOT_FOUND!,
    };
  }
}
