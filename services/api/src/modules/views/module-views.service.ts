import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateModuleViewDto } from './dto/create-module-view.dto';
import { UpdateModuleViewDto } from './dto/update-module-view.dto';
import { slugify } from '../../common/utils/slugify.util';

@Injectable()
export class ModuleViewsService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(currentUser: AuthenticatedUser): string {
    const tenantId = currentUser?.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.');
    }

    return tenantId;
  }

  private getUserId(currentUser: AuthenticatedUser): string {
    const userId = currentUser?.userId?.trim();
    if (!userId) {
      throw new BadRequestException('User context is required.');
    }

    return userId;
  }

  private normalizeName(name: string): string {
    const normalized = name?.trim();

    if (!normalized) {
      throw new BadRequestException('View name is required.');
    }

    return normalized;
  }

  private normalizeModuleKey(moduleKey?: string): string | undefined {
    const normalized = moduleKey?.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeSlug(input: string): string {
    const normalized = slugify(input?.trim() ?? '');

    if (!normalized) {
      throw new BadRequestException('A valid slug could not be generated.');
    }

    return normalized;
  }

  private normalizeType(type?: string): $Enums.ModuleViewType {
    if (!type) {
      return 'custom';
    }

    if (type !== 'system' && type !== 'custom') {
      throw new BadRequestException('Invalid view type.');
    }

    return type as $Enums.ModuleViewType;
  }

  private normalizeVisibilityScope(
    visibilityScope?: string,
  ): $Enums.ModuleViewVisibilityScope {
    if (!visibilityScope) {
      return 'tenant';
    }

    if (
      visibilityScope !== 'tenant' &&
      visibilityScope !== 'role' &&
      visibilityScope !== 'user'
    ) {
      throw new BadRequestException('Invalid visibility scope.');
    }

    return visibilityScope as $Enums.ModuleViewVisibilityScope;
  }

  private toInputJsonValue(
    value:
      | Prisma.InputJsonValue
      | Record<string, unknown>
      | string[]
      | null
      | undefined,
    fallback: Prisma.InputJsonValue,
  ): Prisma.InputJsonValue {
    if (value === undefined || value === null) {
      return fallback;
    }

    return value as Prisma.InputJsonValue;
  }

  private async generateUniqueSlug(
    tx: Prisma.TransactionClient,
    tenantId: string,
    moduleKey: string,
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    const existing = await tx.moduleView.findMany({
      where: {
        tenantId,
        moduleKey,
        slug: {
          startsWith: baseSlug,
        },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: {
        slug: true,
      },
    });

    if (!existing.some((item) => item.slug === baseSlug)) {
      return baseSlug;
    }

    let counter = 2;
    let candidate = `${baseSlug}-${counter}`;

    const usedSlugs = new Set(existing.map((item) => item.slug));

    while (usedSlugs.has(candidate)) {
      counter += 1;
      candidate = `${baseSlug}-${counter}`;
    }

    return candidate;
  }

  async listForCurrentTenant(
    currentUser: AuthenticatedUser,
    moduleKey?: string,
  ) {
    const tenantId = this.getTenantId(currentUser);
    const normalizedModuleKey = this.normalizeModuleKey(moduleKey);

    return this.prisma.moduleView.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(normalizedModuleKey ? { moduleKey: normalizedModuleKey } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createForCurrentTenant(
    currentUser: AuthenticatedUser,
    dto: CreateModuleViewDto,
  ) {
    const tenantId = this.getTenantId(currentUser);
    const createdByUserId = this.getUserId(currentUser);

    const name = this.normalizeName(dto.name);
    const moduleKey = this.normalizeModuleKey(dto.moduleKey);

    if (!moduleKey) {
      throw new BadRequestException('Module key is required.');
    }

    const slugBase = this.normalizeSlug(dto.slug || name);
    const type = this.normalizeType(dto.type);
    const visibilityScope = this.normalizeVisibilityScope(dto.visibilityScope);

    return this.prisma.$transaction(async (tx) => {
      const slug = await this.generateUniqueSlug(
        tx,
        tenantId,
        moduleKey,
        slugBase,
      );

      if (dto.isDefault) {
        await tx.moduleView.updateMany({
          where: {
            tenantId,
            moduleKey,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.moduleView.create({
        data: {
          tenantId,
          moduleKey,
          name,
          slug,
          type,
          isDefault: dto.isDefault ?? false,
          isShared: dto.isShared ?? false,
          visibilityScope,
          allowedRoleKeys: this.toInputJsonValue(dto.allowedRoleKeys, []),
          allowedUserIds: this.toInputJsonValue(dto.allowedUserIds, []),
          configJson: this.toInputJsonValue(dto.configJson, {}),
          sortOrder: dto.sortOrder ?? 0,
          createdByUserId,
          isActive: dto.isActive ?? true,
        },
      });
    });
  }

  async updateForCurrentTenant(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateModuleViewDto,
  ) {
    const tenantId = this.getTenantId(currentUser);

    const existing = await this.prisma.moduleView.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Module view not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      let nextSlug: string | undefined;

      if (dto.slug !== undefined) {
        const slugBase = this.normalizeSlug(dto.slug);
        nextSlug = await this.generateUniqueSlug(
          tx,
          tenantId,
          existing.moduleKey,
          slugBase,
          id,
        );
      } else if (dto.name !== undefined) {
        const nextName = this.normalizeName(dto.name);

        if (nextName !== existing.name) {
          const slugBase = this.normalizeSlug(nextName);
          nextSlug = await this.generateUniqueSlug(
            tx,
            tenantId,
            existing.moduleKey,
            slugBase,
            id,
          );
        }
      }

      if (dto.isDefault === true) {
        await tx.moduleView.updateMany({
          where: {
            tenantId,
            moduleKey: existing.moduleKey,
            isDefault: true,
            NOT: { id },
          },
          data: {
            isDefault: false,
          },
        });
      }

      const updateData: Prisma.ModuleViewUpdateInput = {
        ...(dto.name !== undefined
          ? { name: this.normalizeName(dto.name) }
          : {}),
        ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
        ...(dto.type !== undefined
          ? { type: this.normalizeType(dto.type) }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isShared !== undefined ? { isShared: dto.isShared } : {}),
        ...(dto.visibilityScope !== undefined
          ? {
              visibilityScope: this.normalizeVisibilityScope(
                dto.visibilityScope,
              ),
            }
          : {}),
        ...(dto.allowedRoleKeys !== undefined
          ? {
              allowedRoleKeys: this.toInputJsonValue(dto.allowedRoleKeys, []),
            }
          : {}),
        ...(dto.allowedUserIds !== undefined
          ? {
              allowedUserIds: this.toInputJsonValue(dto.allowedUserIds, []),
            }
          : {}),
        ...(dto.configJson !== undefined
          ? {
              configJson: this.toInputJsonValue(dto.configJson, {}),
            }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      };

      return tx.moduleView.update({
        where: { id },
        data: updateData,
      });
    });
  }

  async removeForCurrentTenant(currentUser: AuthenticatedUser, id: string) {
    const tenantId = this.getTenantId(currentUser);

    const existing = await this.prisma.moduleView.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Module view not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.moduleView.update({
        where: { id },
        data: {
          isActive: false,
          isDefault: false,
        },
      });

      if (existing.isDefault) {
        const fallback = await tx.moduleView.findFirst({
          where: {
            tenantId,
            moduleKey: existing.moduleKey,
            isActive: true,
            id: { not: id },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        if (fallback) {
          await tx.moduleView.update({
            where: { id: fallback.id },
            data: {
              isDefault: true,
            },
          });
        }
      }

      return { success: true };
    });
  }
}
