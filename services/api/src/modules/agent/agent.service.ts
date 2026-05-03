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
  getAccessTokenSecret,
  getAgentAccessTokenTtl,
  getRefreshTokenSecret,
  getAgentRefreshTokenTtl,
  parseDurationToMilliseconds,
} from '../../common/config/auth.config';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildScopedAccessWhere } from '../../common/security/rbac-query-scope';
import { AgentDeviceDto } from './dto/agent-device.dto';
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

type AgentTokenPayload = {
  sub: string;
  tenantId: string;
  email: string;
  deviceId: string;
  sessionId: string;
  type: 'access' | 'agent-refresh';
};

const DEFAULT_AGENT_SETTINGS = {
  enabled: true,
  heartbeatIntervalSeconds: 60,
  idleThresholdSeconds: 120,
  awayThresholdSeconds: 600,
  captureActiveApp: true,
  captureWindowTitle: false,
  offlineQueueEnabled: true,
  heartbeatBatchSize: 10,
  minimumSupportedVersion: '1.0.0',
  latestVersion: '1.0.0',
  forceUpdate: false,
  updateMessage: null,
  autoUpdateEnabled: true,
};

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: AgentLoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email.trim().toLowerCase() },
      include: {
        tenant: true,
        employee: true,
      },
    });
    console.log('[Agent Login Debug]', {
      email: dto.email,
      normalizedEmail: dto.email.trim().toLowerCase(),
      userFound: Boolean(user),
      userId: user?.id,
      userEmail: user?.email,
      userStatus: user?.status,
      tenantId: user?.tenantId,
      tenantStatus: user?.tenant?.status,
      employeeId: user?.employee?.id,
      hasPasswordHash: Boolean(user?.passwordHash),
    });
    if (!user) {
      throw new UnauthorizedException(
        'Agent login failed: user was not found.',
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    console.log('[Agent Login Password Debug]', {
      userId: user.id,
      passwordMatches,
    });

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Agent login failed: password does not match.',
      );
    }

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

    const tokenRecord = await this.findMatchingRefreshToken(
      user.id,
      device.id,
      dto.refreshToken,
    );

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    await this.prisma.agentRefreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
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

    const today = startOfUtcDay(new Date());

    const [devices, latestSession, todaySummary, recentEvents] =
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
          },
          orderBy: {
            occurredAt: 'desc',
          },
          take: 25,
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
    };
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
    const settings = await this.getOrCreateSettings(tenantId);
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

    return this.prisma.agentTrackingSettings.upsert({
      where: { tenantId: currentUser.tenantId },
      create: {
        tenantId: currentUser.tenantId,
        ...DEFAULT_AGENT_SETTINGS,
        ...normalizeSettingsDto(dto),
      },
      update: normalizeSettingsDto(dto),
    });
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
  }) {
    const sessionId = randomUUID();
    const accessTokenTtl = getAgentAccessTokenTtl(this.configService);
    const refreshTokenTtl = getAgentRefreshTokenTtl(this.configService);
    const accessToken = this.jwtService.sign(
      {
        sub: input.userId,
        tenantId: input.tenantId,
        email: input.email,
        deviceId: input.deviceId,
        sessionId,
        type: 'access',
      } satisfies AgentTokenPayload,
      {
        secret: getAccessTokenSecret(this.configService),
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
      } satisfies AgentTokenPayload,
      {
        secret: getRefreshTokenSecret(this.configService),
        expiresIn: refreshTokenTtl as StringValue,
      },
    );

    await this.prisma.agentRefreshToken.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        employeeId: input.employeeId,
        deviceId: input.deviceId,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        expiresAt: new Date(
          Date.now() + parseDurationToMilliseconds(refreshTokenTtl),
        ),
      },
    });

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: accessTokenTtl,
      refreshTokenExpiresIn: refreshTokenTtl,
    };
  }

  private async verifyAgentRefreshToken(refreshToken: string) {
    const payload = await this.jwtService.verifyAsync<AgentTokenPayload>(
      refreshToken,
      { secret: getRefreshTokenSecret(this.configService) },
    );

    if (payload.type !== 'agent-refresh') {
      throw new UnauthorizedException('Refresh token is invalid.');
    }

    return payload;
  }

  private async findMatchingRefreshToken(
    userId: string,
    deviceId: string,
    refreshToken: string,
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

  private getOrCreateSettings(tenantId: string) {
    return this.prisma.agentTrackingSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...DEFAULT_AGENT_SETTINGS },
      update: {},
    });
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
  heartbeatBatchSize: number;
  offlineQueueEnabled: boolean;
  autoUpdateEnabled: boolean;
}) {
  return {
    agentVersionPolicy: {
      minimumSupportedVersion: settings.minimumSupportedVersion,
      latestVersion: settings.latestVersion,
      forceUpdate: settings.forceUpdate,
      updateMessage: settings.updateMessage,
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
    },
    api: {
      heartbeatBatchSize: settings.heartbeatBatchSize,
      offlineQueueEnabled: settings.offlineQueueEnabled,
    },
    features: {
      activeAppTracking: settings.captureActiveApp,
      windowTitleTracking: settings.captureWindowTitle,
      offlineQueue: settings.offlineQueueEnabled,
      autoUpdate: settings.autoUpdateEnabled,
      trayStatus: true,
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
  };
}
