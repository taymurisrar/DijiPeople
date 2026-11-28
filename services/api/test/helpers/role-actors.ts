import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';

import type { PrismaService } from '../../src/common/prisma/prisma.service';
import type { HttpActor, HttpActors } from './http-actors';

/**
 * A tenant user holding a throwaway role with EXACTLY these legacy permission
 * keys and these (entity, privilege) matrix grants, and nothing else.
 *
 * `scopedActor` is fixed to the EMPLOYEES entity and links an employee record; some
 * suites need other entities (CUSTOMIZATION, PROJECTS) and no employee at all, so
 * this is the smaller sibling. The role key is deliberately not an elevated one
 * (`hasElevatedTenantRole` would bypass the very guards under test).
 *
 * Rows are created for the given tenant only; they go away with the tenant
 * (cascade) and the user/identity rows are removed by `actors.cleanup()`.
 */
export async function roleActor(
  prisma: PrismaService,
  actors: HttpActors,
  input: {
    tenantId: string;
    unit: string;
    label: string;
    suffix: string;
    keys: readonly string[];
    grants: ReadonlyArray<{
      entityKey: string;
      privileges: readonly SecurityPrivilege[];
    }>;
    level?: SecurityAccessLevel;
  },
): Promise<HttpActor> {
  const actor = await actors.tenantUser(
    input.tenantId,
    input.unit,
    input.label,
  );
  const role = await prisma.role.create({
    data: {
      tenantId: input.tenantId,
      key: `ra-${input.label}-${input.suffix}`,
      name: `RA ${input.label}`,
    },
    select: { id: true },
  });
  const permissionIds: string[] = [];
  for (const key of input.keys) {
    const permission = await prisma.permission.upsert({
      where: { tenantId_key: { tenantId: input.tenantId, key } },
      update: {},
      create: {
        tenantId: input.tenantId,
        key,
        name: `${key} (${input.suffix})`,
      },
      select: { id: true },
    });
    permissionIds.push(permission.id);
  }
  if (permissionIds.length) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        tenantId: input.tenantId,
        roleId: role.id,
        permissionId,
      })),
    });
  }
  await prisma.rolePrivilege.createMany({
    data: input.grants.flatMap((grant) =>
      grant.privileges.map((privilege) => ({
        tenantId: input.tenantId,
        roleId: role.id,
        entityKey: grant.entityKey,
        privilege,
        accessLevel: input.level ?? SecurityAccessLevel.TENANT,
      })),
    ),
  });
  await prisma.userRole.create({
    data: { tenantId: input.tenantId, userId: actor.id, roleId: role.id },
  });
  return actor;
}
