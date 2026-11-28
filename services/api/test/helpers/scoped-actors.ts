import {
  SecurityAccessLevel,
  SecurityPrivilege,
  type Prisma,
} from '@prisma/client';

import { ENTITY_KEYS } from '../../src/common/constants/rbac-matrix';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import type { HttpActor, HttpActors } from './http-actors';

/**
 * A tenant user holding exactly these permission keys and this access level on the
 * EMPLOYEES entity, plus an employee record linked to them. The access level is
 * what decides whose work and evidence they reach, so tests built on this prove
 * scoping through the real guard rather than by calling a service directly.
 */
export async function scopedActor(
  prisma: PrismaService,
  actors: HttpActors,
  input: {
    tenantId: string;
    unit: string;
    label: string;
    suffix: string;
    keys: readonly string[];
    level: SecurityAccessLevel;
    privileges?: SecurityPrivilege[];
    employee?: Partial<Prisma.EmployeeUncheckedCreateInput>;
  },
): Promise<{ actor: HttpActor; employeeId: string }> {
  const actor = await actors.tenantUser(
    input.tenantId,
    input.unit,
    input.label,
  );
  const role = await prisma.role.create({
    data: {
      tenantId: input.tenantId,
      key: `sa-${input.label}-${input.suffix}`,
      name: `SA ${input.label}`,
    },
    select: { id: true },
  });
  const perms: Array<{ id: string }> = [];
  for (const key of input.keys) {
    perms.push(
      await prisma.permission.upsert({
        where: { tenantId_key: { tenantId: input.tenantId, key } },
        update: {},
        create: {
          tenantId: input.tenantId,
          key,
          name: `${key} (${input.suffix})`,
        },
        select: { id: true },
      }),
    );
  }
  await prisma.rolePermission.createMany({
    data: perms.map((p) => ({
      tenantId: input.tenantId,
      roleId: role.id,
      permissionId: p.id,
    })),
  });
  await prisma.rolePrivilege.createMany({
    data: (
      input.privileges ?? [
        SecurityPrivilege.READ,
        SecurityPrivilege.WRITE,
        SecurityPrivilege.MANAGE,
      ]
    ).map((privilege) => ({
      tenantId: input.tenantId,
      roleId: role.id,
      entityKey: ENTITY_KEYS.EMPLOYEES,
      privilege,
      accessLevel: input.level,
    })),
  });
  await prisma.userRole.create({
    data: { tenantId: input.tenantId, userId: actor.id, roleId: role.id },
  });
  const employee = await prisma.employee.create({
    data: {
      tenantId: input.tenantId,
      employeeCode: `${input.label}-${input.suffix}`,
      firstName: input.label,
      lastName: 'Test',
      phone: '0',
      hireDate: new Date('2024-01-01'),
      businessUnitId: input.unit,
      employmentStatus: 'ACTIVE',
      userId: actor.id,
      ...input.employee,
    },
    select: { id: true },
  });
  return { actor, employeeId: employee.id };
}
