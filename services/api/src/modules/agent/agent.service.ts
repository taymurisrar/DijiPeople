import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AgentActivityState,
  Prisma,
  SecurityPrivilege,
  UserStatus,
  WorkSessionStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { StringValue } from 'ms';
import {
  getClientAccessTokenSecret,
  getAgentSessionAbsoluteTimeoutMs,
  getAgentSessionIdleTimeoutMs,
  getAgentAccessTokenTtl,
  getClientRefreshTokenSecret,
  getAgentRefreshTokenTtl,
  AUTH_CLIENT_IDS,
  parseDurationToMilliseconds,
} from '../../common/config/auth.config';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import {
  AgentDeviceDto,
  CompleteAgentLocationRequestDto,
  CreateAgentLocationRequestDto,
  UpdateAgentDevicePermissionsDto,
} from './dto/agent-device.dto';
import {
  AgentLoginDto,
  AgentLogoutDto,
  AgentRefreshDto,
} from './dto/agent-auth.dto';
import {
  EndAgentSessionDto,
  HeartbeatDto,
  HeartbeatEventDto,
  StartAgentSessionDto,
} from './dto/agent-session.dto';
import { UpdateAgentSettingsDto } from './dto/update-agent-settings.dto';
import { AgentHistoryQueryDto } from './dto/agent-history-query.dto';
import { AuditService } from '../audit/audit.service';

type ExtendedAgentSettings =
  Prisma.AgentTrackingSettingsGetPayload<Prisma.AgentTrackingSettingsDefaultArgs> & {
    mandatory: boolean;
    historyRetentionDays: number;
    installerUrl: string | null;
    releaseDate: Date | null;
  };

type AgentTokenPayload = {
  sub: string;
  tenantId: string;
  email: string;
  deviceId: string;
  sessionId: string;
  type?: 'access' | 'agent-refresh';
  tokenUse: 'access' | 'refresh';
  appClientId: 'agent-desktop';
  aud: 'agent-desktop';
};

const DEFAULT_AGENT_SETTINGS = {
  enabled: true,
  mandatory: false,
  heartbeatIntervalSeconds: 60,
  idleThresholdSeconds: 120,
  awayThresholdSeconds: 600,
  captureActiveApp: true,
  captureWindowTitle: true,
  allowCameraAccess: false,
  allowMicrophoneAccess: false,
  allowLocationAccess: false,
  offlineQueueEnabled: true,
  heartbeatBatchSize: 10,
  minimumSupportedVersion: '1.0.0',
  latestVersion: '1.0.0',
  forceUpdate: false,
  updateMessage: null,
  autoUpdateEnabled: true,
  historyRetentionDays: 90,
  installerUrl: null,
  releaseDate: null,
};

const AGENT_RETENTION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * A real bcrypt hash of a value nothing can log in with, compared against when
 * no account matched so that a rejected address costs the same time as a
 * rejected password (BUG-0033).
 *
 * It is a constant rather than a generated hash because generating one per call
 * would itself cost a full bcrypt round on top of the comparison, doubling the
 * time for exactly the case being disguised.
 *
 * THE COST FACTOR IS PART OF THE FIX. User passwords are hashed at cost 12
 * (`auth.service.ts`, `user-invitations.service.ts`). Measured on the CI-class
 * hardware this was written on, a cost-12 comparison takes ~261 ms and a cost-10
 * one ~67 ms — so equalising with a cheaper hash would leave a four-fold gap
 * that enumerates accounts just as well as the message used to. If password
 * hashing ever moves off cost 12, regenerate this at the new factor.
 */
const TIMING_EQUALISATION_HASH =
  '$2b$12$LPx7pI50rcgcWOzXn9PTBe9f/A2VC4yjOFiWC.FnF26ArQ6E9YYwG';
// Desktop machines have no GPS. Windows Location Services positions them from
// Wi-Fi and network data, which realistically lands between 20 m and 2 km, so a
// tighter bound rejected every genuine capture. Anything looser than this is
// IP-level geolocation (tens of kilometres) and is not worth recording.
const MAX_LOCATION_ACCURACY_METERS = 2000;
const LOCATION_REQUEST_EXPIRY_MS = 10 * 60 * 1000;

const agentLocationRequestSelect = {
  id: true,
  status: true,
  requestedAt: true,
  promptedAt: true,
  respondedAt: true,
  capturedAt: true,
  expiresAt: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  errorMessage: true,
  deviceId: true,
} satisfies Prisma.AgentLocationRequestSelect;

@Injectable()
export class AgentService {
  private readonly retentionCleanupByTenant = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: AgentLoginDto) {
    /*
     * BUG-0033. This handler is `@Public()` and reachable by anyone, so every
     * observable difference between "no such address" and "wrong password" is an
     * account-enumeration oracle covering every tenant at once. Three channels
     * leaked it and all three are closed here:
     *
     *   1. the message  — both outcomes now return the same `Invalid
     *      credentials.` the tenant login has always returned;
     *   2. the timing   — a missing user used to skip bcrypt entirely and answer
     *      in microseconds, which enumerates just as well as the message did, so
     *      a comparison against a dummy hash is run instead;
     *   3. the identity — `findFirst` by e-mail alone is non-deterministic,
     *      because `User` is unique on `[tenantId, email]`, not on `email`.
     *
     * (3) is a correctness defect as much as a security one. Someone employed by
     * two tenants — a contractor, an outsourced accountant — resolved to
     * whichever row the database happened to return, so they could be refused
     * their own account or land in the wrong workspace depending on plan order.
     * The desktop agent sends no workspace (see `AgentLoginDto`), so the
     * password is what disambiguates: the candidate whose hash matches is the
     * account being logged into.
     */
    const email = dto.email.trim().toLowerCase();
    const candidates = await this.prisma.user.findMany({
      where: { email },
      include: {
        tenant: true,
        employee: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let user: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      if (await bcrypt.compare(dto.password, candidate.passwordHash)) {
        user = candidate;
        break;
      }
    }

    if (!user) {
      // Spend comparable time on a rejected address so the response time does
      // not answer the question the message refuses to.
      if (candidates.length === 0) {
        await bcrypt.compare(dto.password, TIMING_EQUALISATION_HASH);
      }
      throw new UnauthorizedException('Invalid credentials.');
    }

    /*
     * These two stay specific on purpose, and are not part of the enumeration
     * closed above: both are only reachable by a caller who has already produced
     * the correct password, so they confirm nothing an attacker did not already
     * know. Collapsing them into `Invalid credentials.` would send a legitimate
     * employee to reset a password that is fine, when the actual answer is that
     * their workspace is suspended or their profile is not linked. This mirrors
     * the reasoning in `AuthService.login`.
     */
    if (
      user.status !== UserStatus.ACTIVE ||
      String(user.tenant.status).toUpperCase() !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('This account is not active.');
    }

    if (!user.employee) {
      throw new ForbiddenException(
        'Desktop agent access requires a linked employee profile.',
      );
    }

    const device = await this.upsertDevice(
      {
        id: user.id,
        tenantId: user.tenantId,
        employee: { id: user.employee.id },
      },
      dto,
    );
    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: user.tenantId,
      employeeId: user.employee.id,
      email: user.email,
      deviceId: device.id,
    });

    return {
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
      },
      user: {
        id: user.id,
        employeeId: user.employee.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
      },
      device,
      tokens,
    };
  }

  async refresh(dto: AgentRefreshDto) {
    const payload = await this.verifyAgentRefreshToken(dto.refreshToken);
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId },
      include: { tenant: true, employee: true },
    });

    if (!user || !user.employee || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Unable to refresh this agent session.');
    }

    const device = await this.prisma.employeeDevice.findFirst({
      where: {
        id: payload.deviceId,
        tenantId: user.tenantId,
        userId: user.id,
        employeeId: user.employee.id,
        deviceFingerprint: dto.deviceFingerprint,
        isActive: true,
      },
    });

    if (!device) {
      throw new UnauthorizedException('Agent device is not registered.');
    }

    const startsNewSession = dto.startNewSession === true;
    const tokenRecord = await this.findMatchingRefreshToken(
      user.id,
      device.id,
      dto.refreshToken,
      { allowExpiredActiveSession: startsNewSession },
    );

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    await this.prisma.agentRefreshToken.update({
      where: { id: tokenRecord.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await this.prisma.employeeDevice.update({
      where: { id: device.id },
      data: {
        agentVersion: dto.agentVersion,
        lastSeenAt: new Date(),
      },
    });

    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: user.tenantId,
      employeeId: user.employee.id,
      email: user.email,
      deviceId: device.id,
      sessionId: startsNewSession ? undefined : payload.sessionId,
      absoluteExpiresAt: startsNewSession
        ? undefined
        : tokenRecord.absoluteExpiresAt,
    });

    return {
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
      },
      user: {
        id: user.id,
        employeeId: user.employee.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
      },
      device,
      tokens,
    };
  }
  async employeeAgentSummary(
    currentUser: AuthenticatedUser,
    employeeId: string,
    query: AgentHistoryQueryDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        AND: [
          { tenantId: currentUser.tenantId, id: employeeId },
          buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
            currentUser,
            ENTITY_KEYS.EMPLOYEES,
            SecurityPrivilege.READ,
            {
              organizationIdField: null,
              userIdField: 'userId',
            },
          ),
        ],
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    const settings = (await this.getOrCreateSettings(
      currentUser.tenantId,
    )) as ExtendedAgentSettings;
    const today = startOfUtcDay(new Date());
    const retentionStart = new Date(
      Date.now() - settings.historyRetentionDays * 24 * 60 * 60 * 1000,
    );
    const { from, to } = resolveHistoryWindow(query, retentionStart);

    const [devices, latestSession, todaySummary, recentEvents, latestLocation] =
      await Promise.all([
        this.prisma.employeeDevice.findMany({
          where: {
            tenantId: currentUser.tenantId,
            employeeId,
          },
          orderBy: [{ isActive: 'desc' }, { lastSeenAt: 'desc' }],
          take: 10,
          select: {
            id: true,
            deviceName: true,
            os: true,
            platform: true,
            agentVersion: true,
            cameraPermission: true,
            microphonePermission: true,
            locationPermission: true,
            permissionUpdatedAt: true,
            lastSeenAt: true,
            isActive: true,
          },
        }),

        this.prisma.workSession.findFirst({
          where: {
            tenantId: currentUser.tenantId,
            employeeId,
          },
          orderBy: [{ lastHeartbeatAt: 'desc' }, { startedAt: 'desc' }],
          select: {
            id: true,
            status: true,
            startedAt: true,
            endedAt: true,
            lastHeartbeatAt: true,
            totalActiveSeconds: true,
            totalIdleSeconds: true,
            totalAwaySeconds: true,
          },
        }),

        this.prisma.dailyProductivitySummary.findUnique({
          where: {
            tenantId_employeeId_date: {
              tenantId: currentUser.tenantId,
              employeeId,
              date: today,
            },
          },
          select: {
            loggedInSeconds: true,
            activeSeconds: true,
            idleSeconds: true,
            awaySeconds: true,
            utilizationPercent: true,
          },
        }),

        this.prisma.activityEvent.findMany({
          where: {
            tenantId: currentUser.tenantId,
            employeeId,
            occurredAt: { gte: from, lte: to },
          },
          orderBy: {
            occurredAt: 'desc',
          },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            state: true,
            idleSeconds: true,
            activeApp: true,
            windowTitle: true,
            activeAppPath: true,
            browserTabTitle: true,
            activeProcessId: true,
            agentVersion: true,
            occurredAt: true,
          },
        }),

        this.prisma.agentLocationRequest.findFirst({
          where: {
            tenantId: currentUser.tenantId,
            employeeId,
          },
          orderBy: { requestedAt: 'desc' },
          select: {
            id: true,
            status: true,
            requestedAt: true,
            promptedAt: true,
            respondedAt: true,
            capturedAt: true,
            expiresAt: true,
            latitude: true,
            longitude: true,
            accuracyMeters: true,
            errorMessage: true,
            deviceId: true,
            requestedBy: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
      ]);

    return {
      employee: {
        id: employee.id,
        userId: employee.userId,
        fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      },
      devices,
      latestSession,
      todaySummary: todaySummary
        ? {
            ...todaySummary,
            utilizationPercent: todaySummary.utilizationPercent.toNumber(),
          }
        : null,
      recentEvents,
      latestLocationRequest: latestLocation
        ? {
            ...latestLocation,
            requestedBy: latestLocation.requestedBy
              ? `${latestLocation.requestedBy.firstName} ${latestLocation.requestedBy.lastName}`.trim() ||
                latestLocation.requestedBy.email
              : null,
          }
        : null,
      liveStatus: resolveLiveStatus(
        latestSession?.lastHeartbeatAt ?? null,
        settings,
      ),
      retention: {
        historyRetentionDays: settings.historyRetentionDays,
        from,
        to,
      },
    };
  }

  async createEmployeeLocationRequest(
    currentUser: AuthenticatedUser,
    employeeId: string,
    dto: CreateAgentLocationRequestDto,
  ) {
    const settings = await this.getOrCreateSettings(currentUser.tenantId);

    if (!settings.allowLocationAccess) {
      throw new BadRequestException(
        'Location access is disabled in desktop agent settings.',
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        AND: [
          { tenantId: currentUser.tenantId, id: employeeId },
          buildScopedAccessWhere<Prisma.EmployeeWhereInput>(
            currentUser,
            ENTITY_KEYS.EMPLOYEES,
            SecurityPrivilege.READ,
            {
              organizationIdField: null,
              userIdField: 'userId',
            },
          ),
        ],
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee was not found.');
    }

    if (!employee.userId) {
      throw new BadRequestException(
        'This employee is not linked to a system user.',
      );
    }

    const device = await this.prisma.employeeDevice.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        employeeId: employee.id,
        userId: employee.userId,
        isActive: true,
        locationPermission: 'GRANTED',
        ...(dto.deviceId ? { id: dto.deviceId } : {}),
      },
      orderBy: [{ lastSeenAt: 'desc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        lastSeenAt: true,
      },
    });

    if (!device) {
      throw new BadRequestException(
        'No active desktop device with granted location permission was found.',
      );
    }

    const now = new Date();
    const request = await this.prisma.agentLocationRequest.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId: employee.id,
        userId: employee.userId,
        deviceId: device.id,
        requestedById: currentUser.userId,
        expiresAt: new Date(now.getTime() + LOCATION_REQUEST_EXPIRY_MS),
      },
      select: agentLocationRequestSelect,
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'AGENT_LOCATION_REQUESTED',
      entityType: 'Employee',
      entityId: employee.id,
      beforeSnapshot: null,
      afterSnapshot: request,
      sourceModule: 'agent',
    });

    return request;
  }

  async getPendingLocationRequest(
    currentUser: AuthenticatedUser,
    deviceId: string,
  ) {
    const employee = await this.getLinkedEmployee(currentUser);
    const settings = await this.getOrCreateSettings(currentUser.tenantId);
    await this.assertOwnDevice(currentUser, employee.id, deviceId);

    if (!settings.allowLocationAccess) {
      return null;
    }

    const request = await this.prisma.agentLocationRequest.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        employeeId: employee.id,
        userId: currentUser.userId,
        deviceId,
        // PROMPTED is included so a request the employee never answered (window
        // closed, agent restarted) can be shown again before it expires.
        status: { in: ['PENDING', 'PROMPTED'] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { requestedAt: 'desc' },
      select: agentLocationRequestSelect,
    });

    if (!request) {
      return null;
    }

    return this.prisma.agentLocationRequest.update({
      where: { id: request.id },
      data: {
        status: 'PROMPTED',
        promptedAt: new Date(),
      },
      select: agentLocationRequestSelect,
    });
  }

  async completeLocationRequest(
    currentUser: AuthenticatedUser,
    requestId: string,
    dto: CompleteAgentLocationRequestDto,
  ) {
    const employee = await this.getLinkedEmployee(currentUser);
    const settings = await this.getOrCreateSettings(currentUser.tenantId);
    await this.assertOwnDevice(currentUser, employee.id, dto.deviceId);

    if (!settings.allowLocationAccess) {
      throw new BadRequestException(
        'Location access is disabled in desktop agent settings.',
      );
    }

    const request = await this.prisma.agentLocationRequest.findFirst({
      where: {
        id: requestId,
        tenantId: currentUser.tenantId,
        employeeId: employee.id,
        userId: currentUser.userId,
        deviceId: dto.deviceId,
        status: { in: ['PENDING', 'PROMPTED'] },
      },
      select: {
        id: true,
        employeeId: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Location request was not found.');
    }

    if (
      dto.status === 'CAPTURED' &&
      (!Number.isFinite(dto.latitude) || !Number.isFinite(dto.longitude))
    ) {
      throw new BadRequestException(
        'Latitude and longitude are required for a captured location.',
      );
    }

    if (
      dto.status === 'CAPTURED' &&
      (!Number.isFinite(dto.accuracyMeters) ||
        Number(dto.accuracyMeters) > MAX_LOCATION_ACCURACY_METERS)
    ) {
      throw new BadRequestException(
        `Location accuracy must be ${MAX_LOCATION_ACCURACY_METERS} meters or better.`,
      );
    }

    const now = new Date();
    const updated = await this.prisma.agentLocationRequest.update({
      where: { id: request.id },
      data: {
        status: dto.status,
        respondedAt: now,
        capturedAt:
          dto.status === 'CAPTURED'
            ? dto.capturedAt
              ? new Date(dto.capturedAt)
              : now
            : null,
        latitude: dto.status === 'CAPTURED' ? dto.latitude : null,
        longitude: dto.status === 'CAPTURED' ? dto.longitude : null,
        accuracyMeters:
          dto.status === 'CAPTURED' ? (dto.accuracyMeters ?? null) : null,
        errorMessage: dto.status === 'CAPTURED' ? null : dto.errorMessage,
      },
      select: agentLocationRequestSelect,
    });

    await this.prisma.employeeDevice.update({
      where: { id: dto.deviceId },
      data: { lastSeenAt: now },
    });

    return updated;
  }

  async logout(dto: AgentLogoutDto) {
    const payload = await this.verifyAgentRefreshToken(dto.refreshToken).catch(
      () => null,
    );

    if (payload) {
      await this.revokeRefreshToken(
        payload.sub,
        payload.deviceId,
        dto.refreshToken,
      );
    }

    return { ok: true };
  }

  async me(currentUser: AuthenticatedUser) {
    const employee = await this.getLinkedEmployee(currentUser);
    return {
      user: {
        id: currentUser.userId,
        employeeId: employee.id,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        fullName: `${currentUser.firstName} ${currentUser.lastName}`,
      },
      employee,
    };
  }

  async myProductivity(currentUser: AuthenticatedUser) {
    const employee = await this.getLinkedEmployee(currentUser);
    const settings = await this.getOrCreateSettings(currentUser.tenantId);
    const today = startOfUtcDay(new Date());
    const [summary, session, device] = await Promise.all([
      this.prisma.dailyProductivitySummary.findUnique({
        where: {
          tenantId_employeeId_date: {
            tenantId: currentUser.tenantId,
            employeeId: employee.id,
            date: today,
          },
        },
      }),
      this.prisma.workSession.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          employeeId: employee.id,
          userId: currentUser.userId,
        },
        orderBy: { lastHeartbeatAt: 'desc' },
      }),
      this.prisma.employeeDevice.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          employeeId: employee.id,
          userId: currentUser.userId,
          isActive: true,
        },
        orderBy: { lastSeenAt: 'desc' },
      }),
    ]);

    const lastSeenAt = session?.lastHeartbeatAt ?? device?.lastSeenAt ?? null;
    const offlineAfterSeconds = Math.max(settings.awayThresholdSeconds, 300);
    const isOffline =
      !lastSeenAt ||
      Date.now() - lastSeenAt.getTime() > offlineAfterSeconds * 1000 ||
      session?.status === WorkSessionStatus.ENDED;

    return {
      currentStatus: isOffline ? 'OFFLINE' : (session?.status ?? 'OFFLINE'),
      lastSeenAt,
      todayActiveSeconds: summary?.activeSeconds ?? 0,
      todayIdleSeconds: summary?.idleSeconds ?? 0,
      todayAwaySeconds: summary?.awaySeconds ?? 0,
      utilizationPercent: summary?.utilizationPercent?.toNumber() ?? 0,
    };
  }

  async getConfig(tenantId: string) {
    const settings = (await this.getOrCreateSettings(
      tenantId,
    )) as ExtendedAgentSettings;
    return toConfigResponse(settings);
  }

  async getSettings(currentUser: AuthenticatedUser) {
    return this.getOrCreateSettings(currentUser.tenantId);
  }

  async updateSettings(
    currentUser: AuthenticatedUser,
    dto: UpdateAgentSettingsDto,
  ) {
    const current = await this.getOrCreateSettings(currentUser.tenantId);
    const nextIdleThreshold =
      dto.idleThresholdSeconds ?? current.idleThresholdSeconds;
    const nextAwayThreshold =
      dto.awayThresholdSeconds ?? current.awayThresholdSeconds;

    if (nextAwayThreshold <= nextIdleThreshold) {
      throw new BadRequestException(
        'Away threshold must be greater than idle threshold.',
      );
    }

    const updated = await this.prisma.agentTrackingSettings.update({
      where: { tenantId: currentUser.tenantId },
      data: normalizeSettingsDto(dto),
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      actorUserId: currentUser.userId,
      action: 'AGENT_SETTINGS_UPDATED',
      entityType: 'AgentTrackingSettings',
      entityId: updated.id,
      beforeSnapshot: current,
      afterSnapshot: updated,
      sourceModule: 'agent',
    });

    return updated;
  }

  async registerDevice(currentUser: AuthenticatedUser, dto: AgentDeviceDto) {
    const employee = await this.getLinkedEmployee(currentUser);
    return this.upsertDevice(
      {
        id: currentUser.userId,
        tenantId: currentUser.tenantId,
        employee,
      },
      dto,
    );
  }

  async updateDevicePermissions(
    currentUser: AuthenticatedUser,
    dto: UpdateAgentDevicePermissionsDto,
  ) {
    const employee = await this.getLinkedEmployee(currentUser);
    const settings = await this.getOrCreateSettings(currentUser.tenantId);
    const device = await this.assertOwnDevice(
      currentUser,
      employee.id,
      dto.deviceId,
    );

    return this.prisma.employeeDevice.update({
      where: { id: device.id },
      data: {
        cameraPermission: settings.allowCameraAccess
          ? dto.cameraPermission
          : 'UNAVAILABLE',
        microphonePermission: settings.allowMicrophoneAccess
          ? dto.microphonePermission
          : 'UNAVAILABLE',
        locationPermission: settings.allowLocationAccess
          ? dto.locationPermission
          : 'UNAVAILABLE',
        permissionUpdatedAt: new Date(),
        lastSeenAt: new Date(),
      },
      select: {
        id: true,
        cameraPermission: true,
        microphonePermission: true,
        locationPermission: true,
        permissionUpdatedAt: true,
      },
    });
  }

  async startSession(
    currentUser: AuthenticatedUser,
    dto: StartAgentSessionDto,
  ) {
    const employee = await this.getLinkedEmployee(currentUser);
    const device = await this.assertOwnDevice(
      currentUser,
      employee.id,
      dto.deviceId,
    );
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();

    const session = await this.prisma.workSession.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId: employee.id,
        userId: currentUser.userId,
        deviceId: device.id,
        startedAt,
        lastHeartbeatAt: startedAt,
      },
    });

    await this.prisma.employeeDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: startedAt },
    });

    return session;
  }

  async heartbeat(currentUser: AuthenticatedUser, dto: HeartbeatDto) {
    const employee = await this.getLinkedEmployee(currentUser);
    const events = normalizeHeartbeatEvents(dto);
    const settings = await this.getOrCreateSettings(currentUser.tenantId);

    if (!settings.enabled) {
      return { accepted: 0, trackingEnabled: false };
    }

    let accepted = 0;
    for (const event of events) {
      await this.saveHeartbeatEvent(currentUser, employee.id, event, settings);
      accepted += 1;
    }

    await this.enforceTelemetryRetention(currentUser.tenantId, settings);

    return {
      accepted,
      trackingEnabled: true,
    };
  }

  async endSession(currentUser: AuthenticatedUser, dto: EndAgentSessionDto) {
    const employee = await this.getLinkedEmployee(currentUser);
    await this.assertOwnDevice(currentUser, employee.id, dto.deviceId);
    const session = await this.prisma.workSession.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        id: dto.sessionId,
        employeeId: employee.id,
        userId: currentUser.userId,
        deviceId: dto.deviceId,
      },
    });

    if (!session) {
      throw new NotFoundException('Work session was not found.');
    }

    return this.prisma.workSession.update({
      where: { id: session.id },
      data: {
        status: WorkSessionStatus.ENDED,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : new Date(),
      },
    });
  }

  private async saveHeartbeatEvent(
    currentUser: AuthenticatedUser,
    employeeId: string,
    event: HeartbeatEventDto,
    settings: Awaited<ReturnType<AgentService['getOrCreateSettings']>>,
  ) {
    const device = await this.assertOwnDevice(
      currentUser,
      employeeId,
      event.deviceId,
    );
    const session = await this.prisma.workSession.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        id: event.sessionId,
        employeeId,
        userId: currentUser.userId,
        deviceId: device.id,
        endedAt: null,
      },
    });

    if (!session) {
      throw new NotFoundException('Active work session was not found.');
    }

    const occurredAt = new Date(event.occurredAt);
    const savedEvent = await this.prisma.activityEvent.create({
      data: {
        tenantId: currentUser.tenantId,
        employeeId,
        userId: currentUser.userId,
        sessionId: session.id,
        deviceId: device.id,
        state: event.state,
        idleSeconds: event.idleSeconds,

        activeApp: settings.captureActiveApp ? (event.activeApp ?? null) : null,

        windowTitle: settings.captureWindowTitle
          ? (event.windowTitle ?? null)
          : null,

        activeAppPath: settings.captureActiveApp
          ? (event.activeAppPath ?? null)
          : null,

        browserTabTitle: settings.captureWindowTitle
          ? (event.browserTabTitle ?? null)
          : null,

        activeProcessId: settings.captureActiveApp
          ? (event.activeProcessId ?? null)
          : null,

        agentVersion: event.agentVersion ?? device.agentVersion,
        occurredAt,
      },
    });

    const incrementSeconds = Math.max(
      1,
      Math.min(settings.heartbeatIntervalSeconds, 3600),
    );
    await Promise.all([
      this.prisma.workSession.update({
        where: { id: session.id },
        data: {
          lastHeartbeatAt: occurredAt,
          status: mapActivityToSessionStatus(event.state),
          ...(event.state === AgentActivityState.ACTIVE
            ? { totalActiveSeconds: { increment: incrementSeconds } }
            : event.state === AgentActivityState.IDLE
              ? { totalIdleSeconds: { increment: incrementSeconds } }
              : { totalAwaySeconds: { increment: incrementSeconds } }),
        },
      }),
      this.prisma.employeeDevice.update({
        where: { id: device.id },
        data: {
          lastSeenAt: occurredAt,
          agentVersion: event.agentVersion ?? device.agentVersion,
        },
      }),
      this.upsertDailySummary(
        currentUser.tenantId,
        employeeId,
        currentUser.userId,
        occurredAt,
        event.state,
        incrementSeconds,
      ),
    ]);

    return savedEvent;
  }

  private async upsertDailySummary(
    tenantId: string,
    employeeId: string,
    userId: string,
    occurredAt: Date,
    state: AgentActivityState,
    seconds: number,
  ) {
    const date = startOfUtcDay(occurredAt);
    const increment = {
      loggedInSeconds: { increment: seconds },
      ...(state === AgentActivityState.ACTIVE
        ? { activeSeconds: { increment: seconds } }
        : state === AgentActivityState.IDLE
          ? { idleSeconds: { increment: seconds } }
          : { awaySeconds: { increment: seconds } }),
    };

    const summary = await this.prisma.dailyProductivitySummary.upsert({
      where: { tenantId_employeeId_date: { tenantId, employeeId, date } },
      create: {
        tenantId,
        employeeId,
        userId,
        date,
        loggedInSeconds: seconds,
        activeSeconds: state === AgentActivityState.ACTIVE ? seconds : 0,
        idleSeconds: state === AgentActivityState.IDLE ? seconds : 0,
        awaySeconds: state === AgentActivityState.AWAY ? seconds : 0,
        utilizationPercent: 0,
        lastCalculatedAt: new Date(),
      },
      update: {
        ...increment,
        lastCalculatedAt: new Date(),
      },
    });

    const activeSeconds = summary.activeSeconds;
    const loggedInSeconds = summary.loggedInSeconds;
    const utilizationPercent =
      loggedInSeconds > 0
        ? new Prisma.Decimal((activeSeconds / loggedInSeconds) * 100)
        : new Prisma.Decimal(0);

    await this.prisma.dailyProductivitySummary.update({
      where: { id: summary.id },
      data: { utilizationPercent },
    });
  }

  private async enforceTelemetryRetention(
    tenantId: string,
    settings: Awaited<ReturnType<AgentService['getOrCreateSettings']>>,
  ) {
    const now = Date.now();
    const lastCleanupAt = this.retentionCleanupByTenant.get(tenantId) ?? 0;

    if (now - lastCleanupAt < AGENT_RETENTION_CLEANUP_INTERVAL_MS) {
      return;
    }

    this.retentionCleanupByTenant.set(tenantId, now);

    const retentionDays = Math.max(
      1,
      Number(settings.historyRetentionDays) ||
        DEFAULT_AGENT_SETTINGS.historyRetentionDays,
    );
    const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffDay = startOfUtcDay(cutoff);

    await this.prisma.$transaction([
      this.prisma.activityEvent.deleteMany({
        where: {
          tenantId,
          occurredAt: { lt: cutoff },
        },
      }),
      this.prisma.agentLocationRequest.deleteMany({
        where: {
          tenantId,
          requestedAt: { lt: cutoff },
          status: { not: 'PENDING' },
        },
      }),
      this.prisma.dailyProductivitySummary.deleteMany({
        where: {
          tenantId,
          date: { lt: cutoffDay },
        },
      }),
      this.prisma.workSession.deleteMany({
        where: {
          tenantId,
          endedAt: { not: null, lt: cutoff },
        },
      }),
    ]);
  }

  private async getLinkedEmployee(currentUser: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        userId: currentUser.userId,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        employmentStatus: true,
      },
    });

    if (!employee) {
      throw new ForbiddenException(
        'Desktop agent access requires a linked employee profile.',
      );
    }

    return employee;
  }

  private async assertOwnDevice(
    currentUser: AuthenticatedUser,
    employeeId: string,
    deviceId: string,
  ) {
    const device = await this.prisma.employeeDevice.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        id: deviceId,
        employeeId,
        userId: currentUser.userId,
        isActive: true,
      },
    });

    if (!device) {
      throw new ForbiddenException(
        'Agent device is not registered for this user.',
      );
    }

    return device;
  }

  private async upsertDevice(
    user: {
      id: string;
      tenantId: string;
      employee: { id: string };
    },
    dto: AgentDeviceDto,
  ) {
    return this.prisma.employeeDevice.upsert({
      where: {
        tenantId_deviceFingerprint: {
          tenantId: user.tenantId,
          deviceFingerprint: dto.deviceFingerprint,
        },
      },
      create: {
        tenantId: user.tenantId,
        employeeId: user.employee.id,
        userId: user.id,
        deviceFingerprint: dto.deviceFingerprint,
        deviceName: dto.deviceName,
        os: dto.os,
        platform: dto.platform,
        agentVersion: dto.agentVersion,
        lastSeenAt: new Date(),
      },
      update: {
        employeeId: user.employee.id,
        userId: user.id,
        deviceName: dto.deviceName,
        os: dto.os,
        platform: dto.platform,
        agentVersion: dto.agentVersion,
        lastSeenAt: new Date(),
        isActive: true,
      },
    });
  }

  private async issueTokens(input: {
    userId: string;
    tenantId: string;
    employeeId: string;
    email: string;
    deviceId: string;
    sessionId?: string;
    absoluteExpiresAt?: Date | null;
  }) {
    const sessionId = input.sessionId ?? randomUUID();
    const accessTokenTtl = getAgentAccessTokenTtl(this.configService);
    const refreshTokenTtl = getAgentRefreshTokenTtl(this.configService);
    const now = Date.now();
    const accessToken = this.jwtService.sign(
      {
        sub: input.userId,
        tenantId: input.tenantId,
        email: input.email,
        deviceId: input.deviceId,
        sessionId,
        type: 'access',
        tokenUse: 'access',
        appClientId: AUTH_CLIENT_IDS.AGENT_DESKTOP,
        aud: AUTH_CLIENT_IDS.AGENT_DESKTOP,
      } satisfies AgentTokenPayload,
      {
        secret: getClientAccessTokenSecret(
          this.configService,
          AUTH_CLIENT_IDS.AGENT_DESKTOP,
        ),
        expiresIn: accessTokenTtl as StringValue,
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: input.userId,
        tenantId: input.tenantId,
        email: input.email,
        deviceId: input.deviceId,
        sessionId,
        type: 'agent-refresh',
        tokenUse: 'refresh',
        appClientId: AUTH_CLIENT_IDS.AGENT_DESKTOP,
        aud: AUTH_CLIENT_IDS.AGENT_DESKTOP,
      } satisfies AgentTokenPayload,
      {
        secret: getClientRefreshTokenSecret(
          this.configService,
          AUTH_CLIENT_IDS.AGENT_DESKTOP,
        ),
        expiresIn: refreshTokenTtl as StringValue,
      },
    );

    await this.prisma.agentRefreshToken.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        employeeId: input.employeeId,
        deviceId: input.deviceId,
        sessionId,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt: new Date(now + parseDurationToMilliseconds(refreshTokenTtl)),
        absoluteExpiresAt:
          input.absoluteExpiresAt ??
          new Date(now + getAgentSessionAbsoluteTimeoutMs(this.configService)),
        lastActivityAt: new Date(now),
      },
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      accessTokenExpiresIn: accessTokenTtl,
      refreshTokenExpiresIn: refreshTokenTtl,
    };
  }

  private async verifyAgentRefreshToken(refreshToken: string) {
    const payload = await this.jwtService.verifyAsync<AgentTokenPayload>(
      refreshToken,
      {
        secret: getClientRefreshTokenSecret(
          this.configService,
          AUTH_CLIENT_IDS.AGENT_DESKTOP,
        ),
      },
    );

    if (
      payload.tokenUse !== 'refresh' ||
      payload.appClientId !== AUTH_CLIENT_IDS.AGENT_DESKTOP ||
      payload.aud !== AUTH_CLIENT_IDS.AGENT_DESKTOP
    ) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    return payload;
  }

  private async findMatchingRefreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string,
    options: { allowExpiredActiveSession?: boolean } = {},
  ) {
    const records = await this.prisma.agentRefreshToken.findMany({
      where: {
        userId,
        deviceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const record of records) {
      if (await bcrypt.compare(refreshToken, record.tokenHash)) {
        if (!options.allowExpiredActiveSession) {
          this.assertAgentRefreshSessionActive(record);
        }
        return record;
      }
    }

    return null;
  }

  private async revokeRefreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string,
  ) {
    const record = await this.findMatchingRefreshToken(
      userId,
      deviceId,
      refreshToken,
    );

    if (record) {
      await this.prisma.agentRefreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  private async getOrCreateSettings(tenantId: string) {
    const existing = await this.prisma.agentTrackingSettings.findUnique({
      where: { tenantId },
    });
    if (existing) {
      if (
        existing.enabled &&
        existing.captureActiveApp &&
        !existing.captureWindowTitle
      ) {
        return this.prisma.agentTrackingSettings.update({
          where: { tenantId },
          data: { captureWindowTitle: true },
        });
      }

      return existing;
    }

    try {
      return await this.prisma.agentTrackingSettings.create({
        data: { tenantId, ...DEFAULT_AGENT_SETTINGS },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const createdByConcurrentRequest =
        await this.prisma.agentTrackingSettings.findUnique({
          where: { tenantId },
        });
      if (createdByConcurrentRequest) return createdByConcurrentRequest;

      throw error;
    }
  }

  private assertAgentRefreshSessionActive(tokenRecord: {
    absoluteExpiresAt: Date | null;
    lastActivityAt: Date | null;
  }) {
    const now = Date.now();

    if (
      tokenRecord.absoluteExpiresAt &&
      tokenRecord.absoluteExpiresAt.getTime() <= now
    ) {
      throw new UnauthorizedException('Agent session has expired.');
    }

    if (
      tokenRecord.lastActivityAt &&
      now - tokenRecord.lastActivityAt.getTime() >
        getAgentSessionIdleTimeoutMs(this.configService)
    ) {
      throw new UnauthorizedException(
        'Agent session expired due to inactivity.',
      );
    }
  }
}

function normalizeHeartbeatEvents(dto: HeartbeatDto): HeartbeatEventDto[] {
  if (dto.events?.length) {
    return dto.events;
  }

  if (!dto.sessionId || !dto.deviceId || !dto.state || !dto.occurredAt) {
    throw new BadRequestException(
      'Heartbeat requires either events[] or sessionId, deviceId, state, idleSeconds, occurredAt.',
    );
  }

  return [
    {
      sessionId: dto.sessionId,
      deviceId: dto.deviceId,
      state: dto.state,
      idleSeconds: dto.idleSeconds ?? 0,
      activeApp: dto.activeApp,
      windowTitle: dto.windowTitle,

      activeAppPath: dto.activeAppPath,
      browserTabTitle: dto.browserTabTitle,
      activeProcessId: dto.activeProcessId,

      agentVersion: dto.agentVersion,
      occurredAt: dto.occurredAt,
    },
  ];
}

function mapActivityToSessionStatus(state: AgentActivityState) {
  return state === AgentActivityState.ACTIVE
    ? WorkSessionStatus.ACTIVE
    : state === AgentActivityState.IDLE
      ? WorkSessionStatus.IDLE
      : WorkSessionStatus.AWAY;
}

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function toConfigResponse(settings: {
  minimumSupportedVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  updateMessage: string | null;
  enabled: boolean;
  heartbeatIntervalSeconds: number;
  idleThresholdSeconds: number;
  awayThresholdSeconds: number;
  captureActiveApp: boolean;
  captureWindowTitle: boolean;
  allowCameraAccess: boolean;
  allowMicrophoneAccess: boolean;
  allowLocationAccess: boolean;
  heartbeatBatchSize: number;
  offlineQueueEnabled: boolean;
  autoUpdateEnabled: boolean;
  mandatory: boolean;
  historyRetentionDays: number;
  installerUrl: string | null;
  releaseDate: Date | null;
}) {
  return {
    agentVersionPolicy: {
      minimumSupportedVersion: settings.minimumSupportedVersion,
      latestVersion: settings.latestVersion,
      forceUpdate: settings.forceUpdate,
      updateMessage: settings.updateMessage,
    },
    policy: {
      mandatory: settings.mandatory,
      allowUserQuit: !settings.mandatory,
    },
    tracking: {
      enabled: settings.enabled,
      heartbeatIntervalSeconds: settings.heartbeatIntervalSeconds,
      idleThresholdSeconds: settings.idleThresholdSeconds,
      awayThresholdSeconds: settings.awayThresholdSeconds,
      captureActiveApp: settings.captureActiveApp,
      captureWindowTitle: settings.captureWindowTitle,
    },
    privacy: {
      allowScreenshots: false,
      allowClipboardTracking: false,
      allowKeylogging: false,
      allowCameraAccess: settings.allowCameraAccess,
      allowMicrophoneAccess: settings.allowMicrophoneAccess,
      allowLocationAccess: settings.allowLocationAccess,
    },
    api: {
      heartbeatBatchSize: settings.heartbeatBatchSize,
      offlineQueueEnabled: settings.offlineQueueEnabled,
    },
    features: {
      activeAppTracking: settings.captureActiveApp,
      windowTitleTracking: settings.captureWindowTitle,
      cameraAccess: settings.allowCameraAccess,
      microphoneAccess: settings.allowMicrophoneAccess,
      locationAccess: settings.allowLocationAccess,
      offlineQueue: settings.offlineQueueEnabled,
      autoUpdate: settings.autoUpdateEnabled,
      trayStatus: true,
    },
    release: {
      installerUrl: settings.installerUrl,
      releaseDate: settings.releaseDate,
      historyRetentionDays: settings.historyRetentionDays,
    },
  };
}

function normalizeSettingsDto(dto: UpdateAgentSettingsDto) {
  return {
    ...dto,
    minimumSupportedVersion: dto.minimumSupportedVersion?.trim(),
    latestVersion: dto.latestVersion?.trim(),
    updateMessage:
      dto.updateMessage === undefined
        ? undefined
        : dto.updateMessage?.trim() || null,
    installerUrl:
      dto.installerUrl === undefined
        ? undefined
        : dto.installerUrl?.trim() || null,
    releaseDate:
      dto.releaseDate === undefined
        ? undefined
        : dto.releaseDate
          ? new Date(dto.releaseDate)
          : null,
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function resolveHistoryWindow(
  query: AgentHistoryQueryDto,
  retentionStart: Date,
) {
  const now = new Date();
  let from = retentionStart;
  let to = now;

  if (query.range === 'day')
    from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (query.range === 'week')
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (query.range === 'month')
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (query.range === 'custom') {
    from = query.from ? new Date(query.from) : retentionStart;
    to = query.to ? new Date(query.to) : now;
  }

  if (from < retentionStart) from = retentionStart;
  if (to > now) to = now;
  if (to < from) to = from;
  return { from, to };
}

function resolveLiveStatus(
  lastHeartbeatAt: Date | null,
  settings: { heartbeatIntervalSeconds: number; awayThresholdSeconds: number },
) {
  if (!lastHeartbeatAt) return 'NEVER_CONNECTED';
  const ageSeconds = (Date.now() - lastHeartbeatAt.getTime()) / 1000;
  if (ageSeconds <= settings.heartbeatIntervalSeconds * 2) return 'LIVE';
  if (
    ageSeconds <=
    Math.max(
      settings.awayThresholdSeconds,
      settings.heartbeatIntervalSeconds * 4,
    )
  )
    return 'STALE';
  return 'OFFLINE';
}
