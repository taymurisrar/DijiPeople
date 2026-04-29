import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getAppOrigin } from '@repo/config';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserInvitationStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { MailerService } from '../../common/mailer/mailer.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { AuditService } from '../audit/audit.service';
import { UsersRepository } from '../users/users.repository';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UserInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly usersRepository: UsersRepository,
    private readonly auditService: AuditService,
  ) {}

  async issueInvitation(input: {
    tenantId: string;
    userId: string;
    employeeId?: string | null;
    email: string;
    fullName: string;
    createdByUserId: string;
    sendNow?: boolean;
  }) {
    const email = normalizeEmail(input.email);
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + this.getInvitationTtlMilliseconds(),
    );

    await this.revokePendingInvitations(input.userId, input.createdByUserId);

    const invitation = await this.prisma.userInvitation.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        employeeId: input.employeeId ?? null,
        email,
        tokenHash,
        expiresAt,
        createdByUserId: input.createdByUserId,
        updatedByUserId: input.createdByUserId,
      },
    });

    const activationLink = this.buildActivationLink(rawToken);
    let deliveryMode: 'log' | 'disabled' | 'sent' = 'disabled';

    if (input.sendNow !== false) {
      const delivery = await this.mailerService.sendAccountActivationLink({
        to: email,
        fullName: input.fullName,
        activationLink,
      });
      deliveryMode = delivery.deliveryMode as 'log' | 'sent';
    }

    await this.auditService.log({
      tenantId: input.tenantId,
      actorUserId: input.createdByUserId,
      action: 'USER_INVITATION_CREATED',
      entityType: 'UserInvitation',
      entityId: invitation.id,
      afterSnapshot: {
        userId: input.userId,
        employeeId: input.employeeId ?? null,
        email,
        expiresAt,
        deliveryMode,
      },
    });

    return {
      invitationId: invitation.id,
      deliveryMode,
      expiresAt: invitation.expiresAt,
      activationLink: this.shouldExposeDevLink() ? activationLink : undefined,
    };
  }

  async getInvitationStatus(token: string) {
    const invitation = await this.findInvitationByToken(token);

    if (!invitation) {
      throw new NotFoundException('Invitation was not found.');
    }

    if (
      invitation.consumedAt ||
      invitation.status === UserInvitationStatus.CONSUMED
    ) {
      throw new BadRequestException('Invitation has already been used.');
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(invitation.id);
      throw new BadRequestException('Invitation has expired.');
    }

    return {
      valid: true,
      email: invitation.email,
      userId: invitation.userId,
      employeeId: invitation.employeeId,
      tenant: invitation.tenant
        ? {
            id: invitation.tenant.id,
            name: invitation.tenant.name,
            slug: invitation.tenant.slug,
          }
        : null,
      user: invitation.user
        ? {
            firstName: invitation.user.firstName,
            lastName: invitation.user.lastName,
            status: invitation.user.status,
          }
        : null,
      expiresAt: invitation.expiresAt,
    };
  }

  async activateAccount(token: string, password: string) {
    const invitation = await this.findInvitationByToken(token);

    if (!invitation) {
      throw new UnauthorizedException('Invitation is invalid.');
    }

    if (
      invitation.consumedAt ||
      invitation.status === UserInvitationStatus.CONSUMED
    ) {
      throw new UnauthorizedException('Invitation has already been used.');
    }

    if (invitation.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(invitation.id);
      throw new UnauthorizedException('Invitation has expired.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.$transaction(async (tx) => {
      await this.usersRepository.update(
        invitation.userId,
        {
          passwordHash,
          status: UserStatus.ACTIVE,
          updatedById: invitation.userId,
        },
        tx,
      );

      await tx.userInvitation.update({
        where: { id: invitation.id },
        data: {
          status: UserInvitationStatus.CONSUMED,
          consumedAt: new Date(),
          updatedByUserId: invitation.userId,
        },
      });

      await tx.userInvitation.updateMany({
        where: {
          userId: invitation.userId,
          id: { not: invitation.id },
          status: UserInvitationStatus.PENDING,
          consumedAt: null,
        },
        data: {
          status: UserInvitationStatus.REVOKED,
          updatedByUserId: invitation.userId,
        },
      });
    });

    await this.auditService.log({
      tenantId: invitation.tenantId,
      actorUserId: invitation.userId,
      action: 'USER_ACCOUNT_ACTIVATED',
      entityType: 'User',
      entityId: invitation.userId,
      afterSnapshot: {
        employeeId: invitation.employeeId,
        email: invitation.email,
      },
    });

    return {
      activated: true,
      email: invitation.email,
    };
  }

  async revokePendingInvitations(
    userId: string,
    actorUserId: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.userInvitation.updateMany({
      where: {
        userId,
        status: UserInvitationStatus.PENDING,
        consumedAt: null,
      },
      data: {
        status: UserInvitationStatus.REVOKED,
        updatedByUserId: actorUserId,
      },
    });
  }

  private async findInvitationByToken(token: string) {
    const tokenHash = this.hashToken(token);
    return this.prisma.userInvitation.findUnique({
      where: { tokenHash },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
      },
    });
  }

  private async markExpired(invitationId: string) {
    await this.prisma.userInvitation.updateMany({
      where: {
        id: invitationId,
        status: UserInvitationStatus.PENDING,
      },
      data: {
        status: UserInvitationStatus.EXPIRED,
      },
    });
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getInvitationTtlMilliseconds() {
    const rawHours = Number(
      this.configService.get('USER_INVITATION_TTL_HOURS') ?? 48,
    );
    const safeHours = Number.isFinite(rawHours) && rawHours > 0 ? rawHours : 48;
    return safeHours * 60 * 60 * 1000;
  }

  private buildActivationLink(rawToken: string) {
    const baseUrl =
      this.configService.get<string>('ACCOUNT_ACTIVATION_LINK_BASE_URL') ??
      `${getAppOrigin('web', process.env)}/activate-account`;

    return `${baseUrl}?token=${encodeURIComponent(rawToken)}`;
  }

  private shouldExposeDevLink() {
    return (
      this.configService.get('NODE_ENV') !== 'production' &&
      this.configService.get('EXPOSE_DEV_AUTH_LINKS') === 'true'
    );
  }
}
