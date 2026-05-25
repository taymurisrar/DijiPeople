import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto';

@Injectable()
export class PlatformUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser) {
    this.assertCanManage(actor);

    const users = await this.prisma.platformUser.findMany({
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }

  async listOwnerCandidates(actor: AuthenticatedUser) {
    this.assertPlatformUser(actor);

    const users = await this.prisma.platformUser.findMany({
      where: {
        role: { in: [PlatformUserRole.SUPER_ADMIN, PlatformUserRole.MEMBER] },
        status: PlatformUserStatus.ACTIVE,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`.trim() || user.email,
      fullName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
    }));
  }

  async create(actor: AuthenticatedUser, dto: CreatePlatformUserDto) {
    this.assertCanManage(actor);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.platformUser.create({
      data: {
        email: normalizeEmail(dto.email),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        passwordHash,
        role: dto.role,
        status: dto.status ?? PlatformUserStatus.ACTIVE,
        createdById: actor.platform?.id,
        updatedById: actor.platform?.id,
      },
    });

    return { userId: user.id, id: user.id };
  }

  async update(
    actor: AuthenticatedUser,
    userId: string,
    dto: UpdatePlatformUserDto,
  ) {
    this.assertCanManage(actor);

    const existing = await this.prisma.platformUser.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new NotFoundException('Platform user was not found.');
    }

    await this.assertSuperAdminInvariant(actor, existing.id, dto);

    return this.prisma.platformUser.update({
      where: { id: userId },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        updatedById: actor.platform?.id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastActiveAt: true,
      },
    });
  }

  async disable(actor: AuthenticatedUser, userId: string) {
    this.assertCanManage(actor);

    const existing = await this.prisma.platformUser.findUnique({
      where: { id: userId },
    });

    if (!existing) {
      throw new NotFoundException('Platform user was not found.');
    }

    if (actor.platform?.id === userId) {
      throw new ForbiddenException('You cannot disable your own account.');
    }

    await this.assertSuperAdminInvariant(actor, existing.id, {
      status: PlatformUserStatus.DISABLED,
    });

    await this.prisma.platformRefreshToken.updateMany({
      where: { platformUserId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return this.prisma.platformUser.update({
      where: { id: userId },
      data: {
        status: PlatformUserStatus.DISABLED,
        updatedById: actor.platform?.id,
      },
      select: { id: true, status: true },
    });
  }

  private assertCanManage(actor: AuthenticatedUser) {
    this.assertPlatformUser(actor);
    if (actor.platform?.role !== PlatformUserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only platform Super Admins can manage platform users.',
      );
    }
  }

  private assertPlatformUser(actor: AuthenticatedUser) {
    if (
      !actor.platform?.id ||
      actor.platform.status !== PlatformUserStatus.ACTIVE
    ) {
      throw new ForbiddenException('Platform user access is required.');
    }
  }

  private async assertSuperAdminInvariant(
    actor: AuthenticatedUser,
    userId: string,
    dto: Pick<UpdatePlatformUserDto, 'role' | 'status'>,
  ) {
    if (
      actor.platform?.id === userId &&
      dto.status === PlatformUserStatus.DISABLED
    ) {
      throw new ForbiddenException('You cannot disable your own account.');
    }

    const wouldRemoveSuperAdmin =
      dto.role === PlatformUserRole.MEMBER ||
      dto.status === PlatformUserStatus.DISABLED;

    if (!wouldRemoveSuperAdmin) return;

    const target = await this.prisma.platformUser.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });

    if (
      target?.role !== PlatformUserRole.SUPER_ADMIN ||
      target.status !== PlatformUserStatus.ACTIVE
    ) {
      return;
    }

    const activeSuperAdminCount = await this.prisma.platformUser.count({
      where: {
        role: PlatformUserRole.SUPER_ADMIN,
        status: PlatformUserStatus.ACTIVE,
      },
    });

    if (activeSuperAdminCount <= 1) {
      throw new BadRequestException(
        'At least one active platform Super Admin is required.',
      );
    }
  }
}
