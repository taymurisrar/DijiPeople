import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateConfigurationRecordDto,
  UpdateConfigurationRecordDto,
} from './dto/configuration-record.dto';
import { isGenericConfigurationKey } from './settings-runtime.catalog';

@Injectable()
export class SettingsRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthenticatedUser, settingKey: string) {
    this.assertKey(settingKey);
    return this.prisma.tenantConfigurationRecord.findMany({
      where: { tenantId: user.tenantId, settingKey },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async detail(user: AuthenticatedUser, settingKey: string, id: string) {
    this.assertKey(settingKey);
    const record = await this.prisma.tenantConfigurationRecord.findFirst({
      where: { id, tenantId: user.tenantId, settingKey },
    });
    if (!record)
      throw new NotFoundException('Configuration record was not found.');
    return record;
  }

  async create(
    user: AuthenticatedUser,
    settingKey: string,
    dto: CreateConfigurationRecordDto,
  ) {
    this.assertKey(settingKey);
    this.validateDates(dto.effectiveFrom, dto.effectiveTo);
    try {
      const record = await this.prisma.tenantConfigurationRecord.create({
        data: {
          tenantId: user.tenantId,
          settingKey,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          description: clean(dto.description),
          configuration: dto.configuration as Prisma.InputJsonValue | undefined,
          effectiveFrom: date(dto.effectiveFrom),
          effectiveTo: date(dto.effectiveTo),
          isActive: dto.isActive ?? true,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      await this.log(
        user,
        'SETTINGS_RUNTIME_RECORD_CREATED',
        record.id,
        null,
        record,
      );
      return record;
    } catch (error) {
      this.handleUnique(error);
    }
  }

  async update(
    user: AuthenticatedUser,
    settingKey: string,
    id: string,
    dto: UpdateConfigurationRecordDto,
  ) {
    const existing = await this.detail(user, settingKey, id);
    this.validateDates(dto.effectiveFrom, dto.effectiveTo);
    try {
      const record = await this.prisma.tenantConfigurationRecord.update({
        where: { id },
        data: {
          ...(dto.code !== undefined
            ? { code: dto.code.trim().toUpperCase() }
            : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: clean(dto.description) }
            : {}),
          ...(dto.configuration !== undefined
            ? { configuration: dto.configuration as Prisma.InputJsonValue }
            : {}),
          ...(dto.effectiveFrom !== undefined
            ? { effectiveFrom: date(dto.effectiveFrom) }
            : {}),
          ...(dto.effectiveTo !== undefined
            ? { effectiveTo: date(dto.effectiveTo) }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedById: user.userId,
        },
      });
      await this.log(
        user,
        'SETTINGS_RUNTIME_RECORD_UPDATED',
        id,
        existing,
        record,
      );
      return record;
    } catch (error) {
      this.handleUnique(error);
    }
  }

  async archive(user: AuthenticatedUser, settingKey: string, id: string) {
    const existing = await this.detail(user, settingKey, id);
    const record = await this.prisma.tenantConfigurationRecord.update({
      where: { id },
      data: { isActive: false, updatedById: user.userId },
    });
    await this.log(
      user,
      'SETTINGS_RUNTIME_RECORD_ARCHIVED',
      id,
      existing,
      record,
    );
    return record;
  }

  private assertKey(settingKey: string) {
    if (!isGenericConfigurationKey(settingKey)) {
      throw new BadRequestException('Unknown generic configuration key.');
    }
  }

  private validateDates(from?: string, to?: string) {
    if (from && to && new Date(from) > new Date(to)) {
      throw new BadRequestException(
        'Effective From cannot be after Effective To.',
      );
    }
  }

  private handleUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Configuration code already exists for this setting.',
      );
    }
    throw error;
  }

  private log(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType: 'TenantConfigurationRecord',
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

function clean(value?: string) {
  const result = value?.trim();
  return result || null;
}

function date(value?: string) {
  return value ? new Date(value) : null;
}
