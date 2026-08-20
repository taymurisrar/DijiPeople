import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  UserInvitationStatus,
  UserStatus,
  type User,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { AuditService } from '../audit/audit.service';
import {
  ensureIdentityForEmail,
  identityHasUsableCredential,
  mirrorPasswordToIdentity,
} from '../users/identity.service';
import { AuthService } from '../auth/auth.service';
import { UserInvitationsService } from '../auth/user-invitations.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { RolesRepository } from '../roles/roles.repository';
import {
  assertTenantPlatformAccess,
  loadTenantOrThrow,
  resolvePlatformActor,
} from './tenant-control-plane.guard';
import type {
  CreateTenantIdentityDto,
  DeleteTenantIdentityDto,
  TransferTenantOwnershipDto,
  UpdateTenantIdentityDto,
} from './dto/tenant-control-plane.dto';

/**
 * The two platform identity types Platform Admin may manage inside a tenant.
 *
 * A Tenant Owner is a human who administers the tenant; a Service Account is a
 * machine identity for a DijiPeople service. Everything else — employees, HR
 * managers, department users, ordinary application users — is tenant-side and
 * is created inside the tenant product. `resolveIdentityType` is what enforces
 * that: a tenant user who is neither of these is invisible to this service, so
 * there is no request shape that can reach one.
 */
export type TenantIdentityType = 'TENANT_OWNER' | 'SERVICE_ACCOUNT';

const IDENTITY_INCLUDE = {
  userRoles: {
    select: { role: { select: { id: true, key: true, name: true } } },
  },
  invitations: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      expiresAt: true,
      consumedAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserInclude;

type IdentityRecord = Prisma.UserGetPayload<{
  include: typeof IDENTITY_INCLUDE;
}>;

@Injectable()
export class TenantAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesRepository: RolesRepository,
    private readonly userInvitations: UserInvitationsService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly events: PlatformEventsService,
  ) {}

  /**
   * Tenant Owners and Service Accounts for one tenant.
   *
   * Returned as two separate collections rather than one user list with a type
   * column: they are different things with different actions, and the screen
   * that shows them says so.
   */
  async list(user: AuthenticatedUser, tenantId: string) {
    assertTenantPlatformAccess(user, 'tenants.read');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);

    const users = await this.prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { isServiceAccount: true },
          { id: tenant.ownerUserId ?? '__none__' },
          {
            userRoles: {
              some: {
                tenantId: tenant.id,
                role: { key: ROLE_KEYS.GLOBAL_ADMIN },
              },
            },
          },
        ],
      },
      include: IDENTITY_INCLUDE,
      orderBy: [{ isServiceAccount: 'asc' }, { createdAt: 'asc' }],
    });

    const actorNames = await this.resolveActorNames(
      users.flatMap((item) => (item.createdById ? [item.createdById] : [])),
    );

    const mapped = users.map((item) =>
      this.mapIdentity(item, tenant.ownerUserId, actorNames),
    );

    const owners = mapped.filter(
      (item) => item.identityType === 'TENANT_OWNER',
    );
    return {
      tenantId: tenant.id,
      primaryOwnerUserId: tenant.ownerUserId,
      owners,
      serviceAccounts: mapped.filter(
        (item) => item.identityType === 'SERVICE_ACCOUNT',
      ),
      activeOwnerCount: owners.filter((item) => item.isActive).length,
    };
  }

  async create(
    user: AuthenticatedUser,
    tenantId: string,
    dto: CreateTenantIdentityDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const email = normalizeEmail(dto.email);

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'A user with this email already exists in this tenant.',
      );
    }

    /*
     * A tenant user row needs a business unit. Provisioning creates one, so a
     * tenant that has none has not finished provisioning — say that rather than
     * failing on a foreign key.
     */
    const businessUnit = dto.businessUnitId
      ? await this.prisma.businessUnit.findFirst({
          where: { id: dto.businessUnitId, tenantId: tenant.id },
          select: { id: true },
        })
      : await this.prisma.businessUnit.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
    if (!businessUnit) {
      throw new BadRequestException(
        'This tenant has no business unit yet. Complete provisioning before adding access.',
      );
    }

    const isOwner = dto.identityType === 'TENANT_OWNER';
    const ownerRole = isOwner
      ? await this.rolesRepository.findByKeyAndTenant(
          tenant.id,
          ROLE_KEYS.GLOBAL_ADMIN,
        )
      : null;
    if (isOwner && !ownerRole) {
      throw new NotFoundException(
        'The tenant Global Administrator role has not been provisioned yet.',
      );
    }

    let reusesExistingCredential = false;

    const created = await this.prisma.$transaction(async (tx) => {
      /*
       * A placeholder nobody knows, including this process. Used only if this
       * email is not already a person — `ensureForEmail` never overwrites an
       * existing credential, which is what makes OD-01's "reuses its
       * credentials with no activation step" true rather than aspirational.
       */
      const placeholderHash = await bcrypt.hash(unguessableSecret(), 12);
      const identityId = await ensureIdentityForEmail(
        tx,
        email,
        placeholderHash,
      );
      /*
       * WP-08 / OD-01: an existing identity keeps its credentials and skips
       * activation entirely.
       *
       * The test is not "does an identity exist" — both provisioning paths
       * create one with an unguessable placeholder, so an identity can exist
       * for somebody who has never set a password. It is "has this person
       * activated somewhere", evidenced by an ACTIVE account in another
       * workspace. Get that wrong in the permissive direction and they get an
       * ACTIVE account nobody can open, with the activation email that was
       * their only way in suppressed.
       */
      reusesExistingCredential = await identityHasUsableCredential(
        tx,
        identityId,
        tenant.id,
      );

      const identity = await tx.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId: businessUnit.id,
          identityId,
          firstName: dto.firstName,
          lastName: isOwner
            ? dto.lastName?.trim() || 'Owner'
            : 'Service Account',
          email,
          /*
           * The workspace account's own copy, kept until the contract phase
           * takes credentials off `User` entirely. The holder sets their real
           * password through the activation link — Platform Admin never chooses
           * or sees one.
           */
          passwordHash: placeholderHash,
          status: reusesExistingCredential
            ? UserStatus.ACTIVE
            : UserStatus.INVITED,
          isServiceAccount: !isOwner,
          serviceAccountPurpose: !isOwner ? (dto.purpose ?? null) : null,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      if (ownerRole) {
        await tx.userRole.create({
          data: {
            tenantId: tenant.id,
            userId: identity.id,
            roleId: ownerRole.id,
            createdById: user.userId,
            updatedById: user.userId,
          },
        });
      }
      return identity;
    });

    /*
     * No activation email for somebody who already has a password. The brief
     * asks for exactly this — *"if the Owner identity already exists, do not
     * unnecessarily force password recreation"* — and sending one anyway would
     * invite them to replace a working credential they share with another
     * workspace.
     */
    const invitation = reusesExistingCredential
      ? null
      : await this.userInvitations.issueInvitation({
          tenantId: tenant.id,
          userId: created.id,
          email: created.email,
          fullName: `${created.firstName} ${created.lastName}`.trim(),
          createdByUserId: user.userId,
        });

    await this.record(user, tenant.id, {
      action: isOwner
        ? 'TENANT_OWNER_CREATED'
        : 'TENANT_SERVICE_ACCOUNT_CREATED',
      entityId: created.id,
      after: {
        email: created.email,
        identityType: dto.identityType,
        status: created.status,
        // Auditable: "why did this person never get an activation email".
        reusedExistingCredential: reusesExistingCredential,
      },
    });

    return {
      identity: this.mapIdentity(
        { ...created, userRoles: [], invitations: [] } as IdentityRecord,
        tenant.ownerUserId,
        new Map(),
      ),
      /*
       * Shown once. The link is single-use and expires; it is not stored in a
       * form the UI can request again.
       *
       * Null when the person already had a password — there is no activation to
       * link to. The screen must say "they can sign in with their existing
       * DijiPeople password" rather than render an empty link box, which is
       * what `reusedExistingCredential` is for.
       */
      activationLink: invitation?.activationLink ?? null,
      activationExpiresAt: invitation?.expiresAt ?? null,
      deliveryStatus: invitation?.deliveryStatus ?? null,
      reusedExistingCredential: reusesExistingCredential,
    };
  }

  async update(
    user: AuthenticatedUser,
    tenantId: string,
    userId: string,
    dto: UpdateTenantIdentityDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const identity = await this.findIdentityOrThrow(tenant.id, userId);

    if (dto.isEnabled === false) {
      await this.assertNotLastActiveOwner(
        tenant.id,
        tenant.ownerUserId,
        identity,
        'disable',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: identity.id },
      data: {
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
        status:
          dto.isEnabled === undefined
            ? undefined
            : dto.isEnabled
              ? /*
                 * Re-enabling an account that never activated must not silently
                 * hand it a working password. It goes back to INVITED so the
                 * holder still has to complete activation.
                 */
                identity.lastLoginAt
                ? UserStatus.ACTIVE
                : UserStatus.INVITED
              : UserStatus.DISABLED,
        updatedById: user.userId,
      },
    });

    if (dto.isEnabled === false) {
      await this.revokeSessions(tenant.id, identity.id);
    }

    await this.record(user, tenant.id, {
      action:
        dto.isEnabled === false
          ? 'TENANT_ACCESS_DISABLED'
          : dto.isEnabled === true
            ? 'TENANT_ACCESS_ENABLED'
            : 'TENANT_ACCESS_UPDATED',
      entityId: identity.id,
      before: { status: identity.status },
      after: { status: updated.status, email: updated.email },
    });

    return this.list(user, tenant.id);
  }

  /**
   * Ask the authentication provider to send a reset. Platform Admin never sees
   * or chooses the new password: the tenant user sets it themselves through the
   * link the auth stack issues, and no plaintext is stored anywhere.
   */
  async sendPasswordReset(
    user: AuthenticatedUser,
    tenantId: string,
    userId: string,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const identity = await this.findIdentityOrThrow(tenant.id, userId);

    if (identity.isServiceAccount) {
      throw new BadRequestException(
        'Service accounts do not use interactive passwords. Rotate the credential instead.',
      );
    }
    if (identity.status === UserStatus.DISABLED) {
      throw new BadRequestException(
        'This account is disabled. Enable it before sending a password reset.',
      );
    }

    const reset = await this.authService.issuePasswordResetForUser({
      tenantId: tenant.id,
      userId: identity.id,
      requestedByUserId: user.userId,
      source: 'platform-admin-tenant-control-plane',
    });

    await this.record(user, tenant.id, {
      action: 'TENANT_OWNER_PASSWORD_RESET_REQUESTED',
      entityId: identity.id,
      after: {
        email: identity.email,
        expiresAt: reset.expiresAt,
        deliveryStatus: reset.deliveryStatus,
      },
    });

    return {
      success: true,
      message: `A password reset has been sent to ${identity.email}.`,
      expiresAt: reset.expiresAt,
      deliveryStatus: reset.deliveryStatus,
    };
  }

  async resendInvitation(
    user: AuthenticatedUser,
    tenantId: string,
    userId: string,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const identity = await this.findIdentityOrThrow(tenant.id, userId);
    if (identity.status === UserStatus.DISABLED) {
      throw new BadRequestException(
        'This account is disabled. Enable it before resending the invitation.',
      );
    }

    const invitation = await this.userInvitations.issueInvitation({
      tenantId: tenant.id,
      userId: identity.id,
      email: identity.email,
      fullName: `${identity.firstName} ${identity.lastName}`.trim(),
      createdByUserId: user.userId,
    });

    await this.record(user, tenant.id, {
      action: 'TENANT_ACCESS_INVITATION_RESENT',
      entityId: identity.id,
      after: {
        email: identity.email,
        expiresAt: invitation.expiresAt,
        deliveryStatus: invitation.deliveryStatus,
      },
    });

    return {
      success: true,
      message: `An invitation has been sent to ${identity.email}.`,
      activationLink: invitation.activationLink,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Rotate a service account credential.
   *
   * Rotation invalidates the current secret, cuts every live session using it,
   * and issues one new single-use activation link. The existing secret is never
   * revealed — it is not recoverable from the database, only replaced.
   */
  async rotateServiceAccountCredential(
    user: AuthenticatedUser,
    tenantId: string,
    userId: string,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const identity = await this.findIdentityOrThrow(tenant.id, userId);
    if (!identity.isServiceAccount) {
      throw new BadRequestException(
        'Credential rotation applies to service accounts only.',
      );
    }

    const rotatedHash = await bcrypt.hash(unguessableSecret(), 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: identity.id },
        data: {
          passwordHash: rotatedHash,
          status: UserStatus.INVITED,
          updatedById: user.userId,
        },
      });
      /*
       * Rotation has to reach the identity too. Once login reads the identity,
       * a rotation that touched only `User` would rotate nothing — a
       * service-account credential reported as revoked and still working is
       * worse than one nobody rotated.
       */
      await mirrorPasswordToIdentity(tx, identity.id, rotatedHash);
    });
    const revoked = await this.revokeSessions(tenant.id, identity.id);

    const invitation = await this.userInvitations.issueInvitation({
      tenantId: tenant.id,
      userId: identity.id,
      email: identity.email,
      fullName: `${identity.firstName} ${identity.lastName}`.trim(),
      createdByUserId: user.userId,
    });

    await this.record(user, tenant.id, {
      action: 'TENANT_SERVICE_ACCOUNT_CREDENTIAL_ROTATED',
      entityId: identity.id,
      after: {
        email: identity.email,
        revokedSessions: revoked,
        expiresAt: invitation.expiresAt,
      },
    });

    return {
      success: true,
      message:
        'Credential rotated. The new activation link is shown once and cannot be retrieved again.',
      activationLink: invitation.activationLink,
      expiresAt: invitation.expiresAt,
      revokedSessions: revoked,
    };
  }

  /**
   * Move the primary-owner designation to another active Tenant Owner.
   *
   * The destination is validated against the same identity rules as everything
   * else, so ownership cannot be handed to an employee account or to a machine
   * identity.
   */
  async transferOwnership(
    user: AuthenticatedUser,
    tenantId: string,
    dto: TransferTenantOwnershipDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const destination = await this.findIdentityOrThrow(tenant.id, dto.toUserId);

    if (destination.isServiceAccount) {
      throw new BadRequestException(
        'Ownership can only be transferred to a Tenant Owner, not a service account.',
      );
    }
    if (destination.status === UserStatus.DISABLED) {
      throw new BadRequestException(
        'Ownership can only be transferred to an enabled account.',
      );
    }
    if (destination.id === tenant.ownerUserId) {
      throw new BadRequestException(
        'This account is already the primary Tenant Owner.',
      );
    }

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { ownerUserId: destination.id, updatedById: user.userId },
    });

    await this.record(user, tenant.id, {
      action: 'TENANT_OWNERSHIP_TRANSFERRED',
      entityId: tenant.id,
      entityType: 'Tenant',
      before: { ownerUserId: tenant.ownerUserId },
      after: {
        ownerUserId: destination.id,
        ownerEmail: destination.email,
        reason: dto.reason,
      },
    });

    return this.list(user, tenant.id);
  }

  /**
   * Delete an access identity.
   *
   * Deletion is the exception, not the norm — disabling preserves the account's
   * historical references. Where business records point at the account, Prisma's
   * own referential rules refuse the delete rather than cascading through them,
   * and that refusal is reported as "disable instead".
   */
  async remove(
    user: AuthenticatedUser,
    tenantId: string,
    userId: string,
    dto: DeleteTenantIdentityDto,
  ) {
    assertTenantPlatformAccess(user, 'tenants.update');
    const tenant = await loadTenantOrThrow(this.prisma, tenantId);
    const identity = await this.findIdentityOrThrow(tenant.id, userId);

    await this.assertNotLastActiveOwner(
      tenant.id,
      tenant.ownerUserId,
      identity,
      'delete',
    );

    if (identity.id === tenant.ownerUserId) {
      throw new BadRequestException(
        'Transfer ownership to another Tenant Owner before deleting this account.',
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: tenant.id, userId: identity.id },
      select: { id: true },
    });
    if (employee) {
      throw new BadRequestException(
        'This account is linked to an employee record. Disable it instead so the employment history stays intact.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userRole.deleteMany({
          where: { tenantId: tenant.id, userId: identity.id },
        });
        await tx.userPermission.deleteMany({
          where: { tenantId: tenant.id, userId: identity.id },
        });
        await tx.user.delete({ where: { id: identity.id } });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2003', 'P2014'].includes(error.code)
      ) {
        throw new ConflictException(
          'This account is referenced by tenant business records. Disable it instead of deleting it.',
        );
      }
      throw error;
    }

    await this.record(user, tenant.id, {
      action: identity.isServiceAccount
        ? 'TENANT_SERVICE_ACCOUNT_DELETED'
        : 'TENANT_OWNER_DELETED',
      entityId: identity.id,
      before: { email: identity.email, status: identity.status },
      after: { reason: dto.reason },
    });

    return this.list(user, tenant.id);
  }

  /** Active Tenant Owner count — the readiness validator's owner rule. */
  async countActiveOwners(tenantId: string) {
    return this.prisma.user.count({
      where: {
        tenantId,
        isServiceAccount: false,
        status: UserStatus.ACTIVE,
        userRoles: {
          some: { tenantId, role: { key: ROLE_KEYS.GLOBAL_ADMIN } },
        },
      },
    });
  }

  private async assertNotLastActiveOwner(
    tenantId: string,
    primaryOwnerUserId: string | null,
    identity: IdentityRecord,
    operation: 'disable' | 'delete',
  ) {
    if (
      this.resolveIdentityType(identity, primaryOwnerUserId) !== 'TENANT_OWNER'
    )
      return;
    if (identity.status !== UserStatus.ACTIVE) return;

    const remaining = await this.prisma.user.count({
      where: {
        tenantId,
        id: { not: identity.id },
        isServiceAccount: false,
        status: UserStatus.ACTIVE,
        userRoles: {
          some: { tenantId, role: { key: ROLE_KEYS.GLOBAL_ADMIN } },
        },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        `This is the last active Tenant Owner. Create or enable another owner before you ${operation} this one.`,
      );
    }
  }

  private async findIdentityOrThrow(tenantId: string, userId: string) {
    const identity = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: IDENTITY_INCLUDE,
    });
    if (!identity) {
      throw new NotFoundException('Tenant access identity was not found.');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { ownerUserId: true },
    });
    if (!this.resolveIdentityType(identity, tenant?.ownerUserId ?? null)) {
      throw new NotFoundException(
        'This tenant user is not a Tenant Owner or Service Account and is managed inside the tenant application.',
      );
    }
    return identity;
  }

  private resolveIdentityType(
    identity: {
      id: string;
      isServiceAccount: boolean;
      userRoles: Array<{ role: { key: string } }>;
    },
    primaryOwnerUserId: string | null,
  ): TenantIdentityType | null {
    if (identity.isServiceAccount) return 'SERVICE_ACCOUNT';
    const isGlobalAdmin = identity.userRoles.some(
      (item) => item.role.key === ROLE_KEYS.GLOBAL_ADMIN,
    );
    if (isGlobalAdmin || identity.id === primaryOwnerUserId)
      return 'TENANT_OWNER';
    return null;
  }

  private mapIdentity(
    identity: IdentityRecord,
    primaryOwnerUserId: string | null,
    actorNames: Map<string, string>,
  ) {
    const invitation = identity.invitations?.[0] ?? null;
    const identityType =
      this.resolveIdentityType(identity, primaryOwnerUserId) ?? 'TENANT_OWNER';
    return {
      id: identity.id,
      identityType,
      fullName:
        `${identity.firstName} ${identity.lastName}`.trim() || identity.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      status: identity.status,
      isActive: identity.status === UserStatus.ACTIVE,
      isPrimaryOwner: identity.id === primaryOwnerUserId,
      isServiceAccount: identity.isServiceAccount,
      purpose: identity.isServiceAccount
        ? identity.serviceAccountPurpose
        : null,
      invitationStatus: resolveInvitationStatus(identity.status, invitation),
      invitationExpiresAt: invitation?.expiresAt ?? null,
      lastSignInAt: identity.lastLoginAt,
      credentialRotatedAt: identity.passwordChangedAt,
      createdAt: identity.createdAt,
      createdByName: identity.createdById
        ? (actorNames.get(identity.createdById) ?? null)
        : null,
      roles: identity.userRoles.map((item) => item.role),
    };
  }

  /**
   * `createdById` can name either a tenant user or a platform user — the two
   * live in different tables, so both are resolved and merged. Showing the id
   * instead was the reason these columns read as UUIDs.
   */
  private async resolveActorNames(ids: string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    const names = new Map<string, string>();
    if (!unique.length) return names;

    const [tenantActors, platformActors] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      this.prisma.platformUser.findMany({
        where: { id: { in: unique } },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);
    for (const actor of [...tenantActors, ...platformActors]) {
      names.set(
        actor.id,
        `${actor.firstName} ${actor.lastName}`.trim() || actor.email,
      );
    }
    return names;
  }

  private async revokeSessions(tenantId: string, userId: string) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async record(
    user: AuthenticatedUser,
    tenantId: string,
    input: {
      action: string;
      entityId: string;
      entityType?: string;
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
    },
  ) {
    const actor = await resolvePlatformActor(this.prisma, user);
    await this.auditService.log({
      tenantId,
      actorUserId: user.userId,
      action: input.action,
      entityType: input.entityType ?? 'User',
      entityId: input.entityId,
      sourceModule: 'tenant-control-plane',
      beforeSnapshot: input.before,
      afterSnapshot: input.after,
    });
    await this.events.record({
      eventCode: input.action,
      source: 'API',
      entityType: input.entityType ?? 'User',
      entityId: input.entityId,
      tenantId,
      actorType: 'PLATFORM_USER',
      actorId: actor.id,
      route: '/platform/tenants/:tenantId/access',
      metadata: { ...input.after, actorName: actor.name },
    });
  }
}

function resolveInvitationStatus(
  status: UserStatus,
  invitation: {
    status: UserInvitationStatus;
    expiresAt: Date;
    consumedAt: Date | null;
  } | null,
) {
  if (status === UserStatus.DISABLED) return 'Disabled';
  if (status === UserStatus.ACTIVE) return 'Activated';
  if (!invitation) return 'Not invited';
  if (invitation.status === UserInvitationStatus.EXPIRED) return 'Expired';
  if (
    invitation.status === UserInvitationStatus.PENDING &&
    invitation.expiresAt.getTime() <= Date.now()
  )
    return 'Expired';
  if (invitation.consumedAt) return 'Activated';
  return 'Invitation pending';
}

/** 32 random bytes. Never persisted in plaintext and never returned. */
function unguessableSecret() {
  return randomBytes(32).toString('hex');
}

export type TenantAccessSummary = Awaited<
  ReturnType<TenantAccessService['list']>
>;
export type TenantIdentitySummary = TenantAccessSummary['owners'][number];
export type { User as TenantIdentityUser };
