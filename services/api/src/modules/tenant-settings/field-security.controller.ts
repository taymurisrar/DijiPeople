import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma, TeamType } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SYSTEM_CUSTOMIZATION_TABLES } from '../customization/customization.registry';

const READ = 'field-security.read';
const MANAGE = 'field-security.manage';
const ALLOWED_DEFAULT_BEHAVIORS = new Set([
  'ALLOW',
  'HIDE',
  'MASK',
  'READ_ONLY',
]);
const ALLOWED_VISIBILITIES = new Set(['VISIBLE', 'HIDDEN', 'MASKED']);
const ALLOWED_ACCESS_MODES = new Set(['READ_ONLY', 'EDITABLE']);
const ALLOWED_MASKING_PATTERNS = new Set([
  'FULL',
  'PARTIAL',
  'LAST_4',
  'CUSTOM',
]);

@Controller('field-security-policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FieldSecurityController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async list(@CurrentUser() user: AuthenticatedUser) {
    const policies = await this.prisma.fieldSecurityPolicy.findMany({
      where: { tenantId: user.tenantId },
      include: {
        _count: {
          select: {
            rules: true,
            roles: true,
            teams: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return policies.map((policy) => this.mapPolicy(policy));
  }

  @Get('lookups/tables')
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  listTableLookups() {
    return SYSTEM_CUSTOMIZATION_TABLES.filter(
      (table) => table.isVisibleInCustomization !== false,
    ).map((table) => ({
      id: table.tableKey,
      value: table.tableKey,
      key: table.tableKey,
      code: table.systemName,
      name: table.pluralName || table.displayName,
      label: table.pluralName || table.displayName,
      description: table.description,
      subtitle: table.moduleKey,
      moduleKey: table.moduleKey,
      tableKey: table.tableKey,
    }));
  }

  @Get('lookups/fields')
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  listFieldLookups(@Query('tableKey') tableKey?: string) {
    const tables = tableKey
      ? SYSTEM_CUSTOMIZATION_TABLES.filter((item) => item.tableKey === tableKey)
      : SYSTEM_CUSTOMIZATION_TABLES;

    return tables.flatMap((table) =>
      table.columns
        .filter(
          (column) =>
            column.isVisible !== false &&
            column.isVisibleInCustomization !== false,
        )
        .map((column) => ({
          id: column.columnKey,
          value: column.columnKey,
          key: column.columnKey,
          code: column.dataType,
          name: tableKey
            ? column.displayName
            : `${table.pluralName || table.displayName} - ${column.displayName}`,
          label: tableKey
            ? column.displayName
            : `${table.pluralName || table.displayName} - ${column.displayName}`,
          description: `${table.tableKey}.${column.columnKey} (${column.dataType})`,
          subtitle: `${table.pluralName || table.displayName} field`,
        })),
    );
  }

  @Get('runtime-rules')
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async runtimeRules(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entityKey') entityKey?: string,
  ) {
    const requestedEntityKey = stringValue(entityKey).trim();
    const table = this.resolveRuntimeTable(requestedEntityKey);
    if (!table) {
      throw new BadRequestException('Protected module is not available.');
    }

    const policies = await this.prisma.fieldSecurityPolicy.findMany({
      where: {
        tenantId: user.tenantId,
        entityKey: table.tableKey,
        isActive: true,
      },
      include: {
        rules: true,
        roles: { include: { role: { select: { key: true } } } },
        teams: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const teamIds = new Set(user.accessContext?.teamIds ?? []);
    const roleKeys = new Set(user.roleKeys ?? []);
    const runtimeEntityLogicalName = runtimeEntityLogicalNameForTable(table);

    return policies
      .filter((policy) => {
        const roleScoped = policy.roles.length > 0;
        const teamScoped = policy.teams.length > 0;
        if (!roleScoped && !teamScoped) return true;
        return (
          policy.roles.some((assignment) =>
            roleKeys.has(assignment.role.key),
          ) || policy.teams.some((assignment) => teamIds.has(assignment.teamId))
        );
      })
      .flatMap((policy) =>
        policy.rules.flatMap((rule) =>
          runtimeRulesFromFieldSecurityRule(
            policy.id,
            runtimeEntityLogicalName,
            rule,
          ),
        ),
      );
  }

  @Get(':policyId')
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
  ) {
    return this.getPolicyOrThrow(user.tenantId, policyId);
  }

  @Post()
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    const name = stringValue(body.name).trim();
    const entityKey = stringValue(body.entityKey).trim();
    const moduleKey = this.resolveModuleKey(body.moduleKey, entityKey);

    if (!name || !moduleKey || !entityKey) {
      throw new BadRequestException(
        'Policy name and protected module are required.',
      );
    }
    this.assertSystemTable(entityKey);

    const policy = await this.prisma.fieldSecurityPolicy.create({
      data: {
        tenantId: user.tenantId,
        name,
        description: nullableString(body.description),
        moduleKey,
        entityKey,
        defaultBehavior: optionValue(
          body.defaultBehavior,
          ALLOWED_DEFAULT_BEHAVIORS,
          'ALLOW',
          'Default behavior',
        ),
        isActive: body.isActive !== false,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });

    return this.getPolicyOrThrow(user.tenantId, policy.id);
  }

  @Patch(':policyId')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.assertPolicy(user.tenantId, policyId);
    const nextEntityKey = has(body, 'entityKey')
      ? stringValue(body.entityKey)
      : '';
    if (nextEntityKey) this.assertSystemTable(nextEntityKey);

    await this.prisma.fieldSecurityPolicy.update({
      where: { id: policyId },
      data: {
        ...(has(body, 'name') ? { name: stringValue(body.name).trim() } : {}),
        ...(has(body, 'description')
          ? { description: nullableString(body.description) }
          : {}),
        ...(has(body, 'entityKey')
          ? {
              entityKey: stringValue(body.entityKey),
              moduleKey: this.resolveModuleKey(
                body.moduleKey,
                stringValue(body.entityKey),
              ),
            }
          : has(body, 'moduleKey')
            ? { moduleKey: stringValue(body.moduleKey) }
            : {}),
        ...(has(body, 'defaultBehavior')
          ? {
              defaultBehavior: optionValue(
                body.defaultBehavior,
                ALLOWED_DEFAULT_BEHAVIORS,
                'ALLOW',
                'Default behavior',
              ),
            }
          : {}),
        ...(has(body, 'isActive') ? { isActive: body.isActive === true } : {}),
        updatedById: user.userId,
      },
    });

    return this.getPolicyOrThrow(user.tenantId, policyId);
  }

  @Delete(':policyId')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
  ) {
    await this.assertPolicy(user.tenantId, policyId);
    await this.prisma.fieldSecurityPolicy.delete({ where: { id: policyId } });
    return { id: policyId, deleted: true };
  }

  @Get(':policyId/rules')
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async listRules(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
  ) {
    if (!(await this.policyExists(user.tenantId, policyId))) {
      return { records: [], totalRecords: 0 };
    }
    const records = await this.prisma.fieldSecurityRule.findMany({
      where: { tenantId: user.tenantId, policyId },
      orderBy: { fieldLabel: 'asc' },
    });
    return { records, totalRecords: records.length };
  }

  @Post(':policyId/rules')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async addRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const policy = await this.getPolicyRecordOrThrow(user.tenantId, policyId);
    const fieldKey = stringValue(body.fieldKey).trim();
    if (!fieldKey) throw new BadRequestException('Field is required.');
    const fieldDefinition = this.resolveFieldDefinition(
      policy.entityKey,
      fieldKey,
    );
    const fieldLabel =
      stringValue(body.fieldLabel) || fieldDefinition.displayName;
    const visibility = optionValue(
      body.visibility,
      ALLOWED_VISIBILITIES,
      'VISIBLE',
      'Visibility',
    );
    const accessMode = optionValue(
      body.accessMode,
      ALLOWED_ACCESS_MODES,
      'EDITABLE',
      'Access mode',
    );
    const maskingPattern = nullableOptionValue(
      body.maskingPattern,
      ALLOWED_MASKING_PATTERNS,
      'Masking pattern',
    );

    return this.prisma.fieldSecurityRule.upsert({
      where: { policyId_fieldKey: { policyId, fieldKey } },
      create: {
        tenantId: user.tenantId,
        policyId,
        fieldKey,
        fieldLabel,
        visibility,
        accessMode,
        maskingPattern,
        customMask:
          maskingPattern === 'CUSTOM' ? nullableString(body.customMask) : null,
        createdById: user.userId,
        updatedById: user.userId,
      },
      update: {
        fieldLabel,
        visibility,
        accessMode,
        maskingPattern,
        customMask:
          maskingPattern === 'CUSTOM' ? nullableString(body.customMask) : null,
        updatedById: user.userId,
      },
    });
  }

  @Patch(':policyId/rules/:ruleId')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async updateRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.assertRule(user.tenantId, policyId, ruleId);
    const maskingPattern = has(body, 'maskingPattern')
      ? nullableOptionValue(
          body.maskingPattern,
          ALLOWED_MASKING_PATTERNS,
          'Masking pattern',
        )
      : undefined;
    const customMaskPatch =
      has(body, 'customMask') || maskingPattern !== undefined
        ? {
            customMask:
              maskingPattern === undefined || maskingPattern === 'CUSTOM'
                ? nullableString(body.customMask)
                : null,
          }
        : {};
    return this.prisma.fieldSecurityRule.update({
      where: { id: ruleId },
      data: {
        ...(has(body, 'fieldLabel')
          ? { fieldLabel: stringValue(body.fieldLabel) }
          : {}),
        ...(has(body, 'visibility')
          ? {
              visibility: optionValue(
                body.visibility,
                ALLOWED_VISIBILITIES,
                'VISIBLE',
                'Visibility',
              ),
            }
          : {}),
        ...(has(body, 'accessMode')
          ? {
              accessMode: optionValue(
                body.accessMode,
                ALLOWED_ACCESS_MODES,
                'EDITABLE',
                'Access mode',
              ),
            }
          : {}),
        ...(has(body, 'maskingPattern') ? { maskingPattern } : {}),
        ...customMaskPatch,
        updatedById: user.userId,
      },
    });
  }

  @Delete(':policyId/rules/:ruleId')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async removeRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Param('ruleId') ruleId: string,
  ) {
    await this.assertRule(user.tenantId, policyId, ruleId);
    await this.prisma.fieldSecurityRule.delete({ where: { id: ruleId } });
    return { id: ruleId, deleted: true };
  }

  @Get(':policyId/roles')
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async listRoles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
  ) {
    if (!(await this.policyExists(user.tenantId, policyId))) {
      return { records: [], totalRecords: 0 };
    }
    const records = await this.prisma.fieldSecurityPolicyRole.findMany({
      where: { tenantId: user.tenantId, policyId },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      records: records.map((row) => ({
        ...row,
        roleName: row.role.name,
        roleDescription: row.role.description,
        roleType: row.role.roleType,
        accessLevel: row.role.accessLevel,
        assignedOn: row.createdAt,
      })),
      totalRecords: records.length,
    };
  }

  @Post(':policyId/roles')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async addRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Body('roleId') roleId: string,
  ) {
    await this.assertPolicy(user.tenantId, policyId);
    await this.assertRoleBelongsToTenant(user.tenantId, roleId);
    return this.prisma.fieldSecurityPolicyRole.upsert({
      where: { policyId_roleId: { policyId, roleId } },
      create: {
        tenantId: user.tenantId,
        policyId,
        roleId,
        createdById: user.userId,
        updatedById: user.userId,
      },
      update: { updatedById: user.userId },
    });
  }

  @Delete(':policyId/roles/:assignmentId')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async removeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    await this.assertRoleAssignment(user.tenantId, policyId, assignmentId);
    await this.prisma.fieldSecurityPolicyRole.delete({
      where: { id: assignmentId },
    });
    return { id: assignmentId, deleted: true };
  }

  @Get(':policyId/access-teams')
  @Permissions(READ)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
  async listTeams(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
  ) {
    if (!(await this.policyExists(user.tenantId, policyId))) {
      return { records: [], totalRecords: 0 };
    }
    const records = await this.prisma.fieldSecurityPolicyTeam.findMany({
      where: { tenantId: user.tenantId, policyId },
      include: { team: { include: { _count: { select: { members: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      records: records.map((row) => ({
        ...row,
        accessTeamName: row.team.name,
        description: row.team.description,
        membersCount: row.team._count.members,
        assignedOn: row.createdAt,
      })),
      totalRecords: records.length,
    };
  }

  @Post(':policyId/access-teams')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async addTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Body('teamId') teamId: string,
  ) {
    await this.assertPolicy(user.tenantId, policyId);
    await this.assertAccessTeam(user.tenantId, teamId);
    return this.prisma.fieldSecurityPolicyTeam.upsert({
      where: { policyId_teamId: { policyId, teamId } },
      create: {
        tenantId: user.tenantId,
        policyId,
        teamId,
        createdById: user.userId,
        updatedById: user.userId,
      },
      update: { updatedById: user.userId },
    });
  }

  @Delete(':policyId/access-teams/:assignmentId')
  @Permissions(MANAGE)
  @RequirePermission(ENTITY_KEYS.SETTINGS, 'configure')
  async removeTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId') policyId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    await this.assertTeamAssignment(user.tenantId, policyId, assignmentId);
    await this.prisma.fieldSecurityPolicyTeam.delete({
      where: { id: assignmentId },
    });
    return { id: assignmentId, deleted: true };
  }

  private async getPolicyOrThrow(tenantId: string, policyId: string) {
    const policy = await this.prisma.fieldSecurityPolicy.findFirst({
      where: { tenantId, id: policyId },
      include: {
        _count: { select: { rules: true, roles: true, teams: true } },
      },
    });
    if (!policy)
      throw new NotFoundException('Field security policy was not found.');
    return this.mapPolicy(policy);
  }

  private mapPolicy(
    policy: Prisma.FieldSecurityPolicyGetPayload<{
      include: {
        _count: { select: { rules: true; roles: true; teams: true } };
      };
    }>,
  ) {
    return {
      ...policy,
      fieldCount: policy._count.rules,
      appliesToRoles: policy._count.roles,
      appliesToAccessTeams: policy._count.teams,
      tableKey: policy.entityKey,
      active: policy.isActive,
    };
  }

  private resolveModuleKey(moduleValue: unknown, entityKey: string) {
    const explicitModule = stringValue(moduleValue).trim();
    if (explicitModule) return explicitModule;
    return (
      SYSTEM_CUSTOMIZATION_TABLES.find((table) => table.tableKey === entityKey)
        ?.moduleKey ?? ''
    );
  }

  private assertSystemTable(entityKey: string) {
    const table = SYSTEM_CUSTOMIZATION_TABLES.find(
      (candidate) => candidate.tableKey === entityKey,
    );
    if (!table)
      throw new BadRequestException('Protected module is not available.');
    return table;
  }

  private resolveRuntimeTable(entityKey: string) {
    return SYSTEM_CUSTOMIZATION_TABLES.find(
      (candidate) =>
        candidate.tableKey === entityKey ||
        runtimeEntityLogicalNameForTable(candidate) === entityKey ||
        candidate.systemName === entityKey,
    );
  }

  private resolveFieldDefinition(entityKey: string, fieldKey: string) {
    const table = this.assertSystemTable(entityKey);
    const field = table.columns.find(
      (column) =>
        column.columnKey === fieldKey &&
        column.isVisible !== false &&
        column.isVisibleInCustomization !== false,
    );
    if (!field) {
      throw new BadRequestException(
        'Field is not available for the selected protected module.',
      );
    }
    return field;
  }

  private async getPolicyRecordOrThrow(tenantId: string, policyId: string) {
    const policy = await this.prisma.fieldSecurityPolicy.findFirst({
      where: { tenantId, id: policyId },
      select: { id: true, entityKey: true },
    });
    if (!policy)
      throw new NotFoundException('Field security policy was not found.');
    return policy;
  }

  private async assertPolicy(tenantId: string, policyId: string) {
    if (!(await this.policyExists(tenantId, policyId)))
      throw new NotFoundException('Field security policy was not found.');
  }

  private async policyExists(tenantId: string, policyId: string) {
    const policy = await this.prisma.fieldSecurityPolicy.findFirst({
      where: { tenantId, id: policyId },
      select: { id: true },
    });
    return Boolean(policy);
  }

  private async assertRule(tenantId: string, policyId: string, ruleId: string) {
    const rule = await this.prisma.fieldSecurityRule.findFirst({
      where: { tenantId, policyId, id: ruleId },
      select: { id: true },
    });
    if (!rule) throw new NotFoundException('Secured field was not found.');
  }

  private async assertRoleBelongsToTenant(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { tenantId, id: roleId, isActive: true },
      select: { id: true },
    });
    if (!role) throw new BadRequestException('Role was not found.');
  }

  private async assertAccessTeam(tenantId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        tenantId,
        id: teamId,
        teamType: TeamType.ACCESS,
        isActive: true,
      },
      select: { id: true },
    });
    if (!team) throw new BadRequestException('Access team was not found.');
  }

  private async assertRoleAssignment(
    tenantId: string,
    policyId: string,
    assignmentId: string,
  ) {
    const row = await this.prisma.fieldSecurityPolicyRole.findFirst({
      where: { tenantId, policyId, id: assignmentId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Role assignment was not found.');
  }

  private async assertTeamAssignment(
    tenantId: string,
    policyId: string,
    assignmentId: string,
  ) {
    const row = await this.prisma.fieldSecurityPolicyTeam.findFirst({
      where: { tenantId, policyId, id: assignmentId },
      select: { id: true },
    });
    if (!row)
      throw new NotFoundException('Access team assignment was not found.');
  }
}

function runtimeRulesFromFieldSecurityRule(
  policyId: string,
  entityLogicalName: string,
  rule: {
    id: string;
    fieldKey: string;
    visibility: string;
    accessMode: string;
    maskingPattern: string | null;
    customMask: string | null;
  },
) {
  const rules: Array<Record<string, unknown>> = [];
  if (rule.visibility === 'HIDDEN') {
    rules.push({
      id: `${policyId}:${rule.id}:read`,
      entityLogicalName,
      fieldLogicalName: rule.fieldKey,
      operation: 'read',
      effect: 'deny',
      reason: 'Hidden by field security policy.',
    });
  } else if (rule.visibility === 'MASKED') {
    rules.push({
      id: `${policyId}:${rule.id}:read`,
      entityLogicalName,
      fieldLogicalName: rule.fieldKey,
      operation: 'read',
      effect: 'mask',
      maskingPattern: rule.maskingPattern ?? 'FULL',
      customMask: rule.customMask,
      reason: 'Masked by field security policy.',
    });
  }

  if (rule.accessMode === 'READ_ONLY') {
    rules.push({
      id: `${policyId}:${rule.id}:update`,
      entityLogicalName,
      fieldLogicalName: rule.fieldKey,
      operation: 'update',
      effect: 'readonly',
      reason: 'Read-only by field security policy.',
    });
  }

  return rules;
}

function runtimeEntityLogicalNameForTable(table: { systemName: string }) {
  return table.systemName.charAt(0).toLowerCase() + table.systemName.slice(1);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim();
  return text || null;
}

function optionValue(
  value: unknown,
  allowedValues: ReadonlySet<string>,
  fallback: string,
  label: string,
) {
  const text = stringValue(value).trim() || fallback;
  if (!allowedValues.has(text)) {
    throw new BadRequestException(
      `${label} must be one of the supported options.`,
    );
  }
  return text;
}

function nullableOptionValue(
  value: unknown,
  allowedValues: ReadonlySet<string>,
  label: string,
) {
  const text = nullableString(value);
  if (!text) return null;
  if (!allowedValues.has(text)) {
    throw new BadRequestException(
      `${label} must be one of the supported options.`,
    );
  }
  return text;
}

function has(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}
