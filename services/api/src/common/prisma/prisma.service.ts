import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RequestContextService } from '../request-context/request-context.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly requestContextService: RequestContextService) {
    super({
      log:
        process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });

    const middlewareRegistrar = (this as any).$use;
    if (typeof middlewareRegistrar !== 'function') {
      this.logger.warn(
        'Prisma middleware registration skipped because PrismaClient.$use is unavailable in this runtime/client build.',
      );
      return;
    }

    middlewareRegistrar.call(this, async (params: any, next: (params: any) => Promise<any>) => {
      const context = this.requestContextService.getContext();
      if (!context || context.effectiveAccessLevel === 'TENANT') {
        return next(params);
      }

      const model = params.model;
      const action = params.action;
      const isScopedAction = [
        'findMany',
        'findFirst',
        'findUnique',
        'count',
        'updateMany',
        'deleteMany',
      ].includes(action);

      if (!model || !isScopedAction) {
        return next(params);
      }

      const scopeWhere = buildScopeWhere(model, context);
      if (!scopeWhere) {
        return next(params);
      }

      if (action === 'findUnique') {
        params.action = 'findFirst';
      }

      params.args = params.args ?? {};
      const existingWhere = params.args.where ?? {};
      params.args.where = mergeWhereWithScope(existingWhere, scopeWhere);

      const result = await next(params);

      const hasIdFilter = hasExplicitIdFilter(params.args?.where);
      const accessDeniedByScope =
        hasIdFilter &&
        ((params.action === 'findFirst' && result === null) ||
          (params.action === 'count' && Number(result ?? 0) === 0) ||
          ((params.action === 'updateMany' || params.action === 'deleteMany') &&
            Number(result?.count ?? 0) === 0));

      if (accessDeniedByScope) {
        await this.auditLog
          .create({
            data: {
              tenantId: context.tenantId,
              actorUserId: context.userId,
              action: 'BUSINESS_UNIT_ACCESS_DENIED',
              entityType: model,
              entityId: resolveEntityIdFromWhere(params.args?.where) ?? 'unknown',
              afterSnapshot: {
                prismaAction: params.action,
                effectiveAccessLevel: context.effectiveAccessLevel,
                requiresSelfScope: context.requiresSelfScope,
              },
            },
          })
          .catch(() => undefined);
      }

      return result;
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function mergeWhereWithScope(existingWhere: Record<string, unknown>, scopeWhere: Record<string, unknown>) {
  if (!existingWhere || Object.keys(existingWhere).length === 0) {
    return scopeWhere;
  }

  return {
    AND: [existingWhere, scopeWhere],
  };
}

function buildScopeWhere(
  model: string,
  context: {
    accessibleBusinessUnitIds: string[];
    accessibleUserIds: string[];
    userId: string;
    requiresSelfScope: boolean;
  },
) {
  const buFilter = {
    in: context.accessibleBusinessUnitIds,
  };

  switch (model) {
    case 'Employee':
      return {
        user: {
          is: {
            businessUnitId: buFilter,
          },
        },
      };
    case 'AttendanceEntry':
      return {
        employee: {
          user: {
            is: {
              businessUnitId: buFilter,
            },
          },
        },
      };
    case 'Timesheet':
      return {
        employee: {
          user: {
            is: {
              businessUnitId: buFilter,
            },
          },
        },
      };
    case 'TimesheetEntry':
      return {
        timesheet: {
          employee: {
            user: {
              is: {
                businessUnitId: buFilter,
              },
            },
          },
        },
      };
    case 'LeaveRequest':
      return {
        employee: {
          user: {
            is: {
              businessUnitId: buFilter,
            },
          },
        },
      };
    case 'Application':
      return {
        OR: [
          { recruiterOwnerUserId: { in: context.accessibleUserIds } },
          { createdById: { in: context.accessibleUserIds } },
          {
            candidate: {
              createdById: {
                in: context.accessibleUserIds,
              },
            },
          },
          {
            jobOpening: {
              createdById: {
                in: context.accessibleUserIds,
              },
            },
          },
        ],
      };
    case 'Candidate':
      return {
        OR: [
          { createdById: { in: context.accessibleUserIds } },
          { updatedById: { in: context.accessibleUserIds } },
          {
            applications: {
              some: {
                recruiterOwnerUserId: { in: context.accessibleUserIds },
              },
            },
          },
        ],
      };
    case 'JobOpening':
      return {
        OR: [
          { createdById: { in: context.accessibleUserIds } },
          { updatedById: { in: context.accessibleUserIds } },
          {
            applications: {
              some: {
                recruiterOwnerUserId: { in: context.accessibleUserIds },
              },
            },
          },
        ],
      };
    case 'EmployeeOnboarding':
      return {
        OR: [
          { ownerUserId: { in: context.accessibleUserIds } },
          { createdById: { in: context.accessibleUserIds } },
          {
            employee: {
              user: {
                is: {
                  businessUnitId: buFilter,
                },
              },
            },
          },
        ],
      };
    case 'OnboardingTask':
      return {
        OR: [
          { assignedUserId: { in: context.accessibleUserIds } },
          {
            employeeOnboarding: {
              OR: [
                { ownerUserId: { in: context.accessibleUserIds } },
                { createdById: { in: context.accessibleUserIds } },
                {
                  employee: {
                    user: {
                      is: {
                        businessUnitId: buFilter,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      };
    case 'PayrollCycle':
    case 'ProcessingCycle':
      return {
        OR: [
          { businessUnitId: null },
          { businessUnitId: buFilter },
        ],
      };
    case 'PayrollRecord':
    case 'EmployeeCompensation':
      return {
        employee: {
          user: {
            is: {
              businessUnitId: buFilter,
            },
          },
        },
      };
    case 'Document':
      return {
        OR: [
          { uploadedByUserId: { in: context.accessibleUserIds } },
          { createdById: { in: context.accessibleUserIds } },
          {
            links: {
              some: {
                employee: {
                  user: {
                    is: {
                      businessUnitId: buFilter,
                    },
                  },
                },
              },
            },
          },
        ],
      };
    case 'DocumentReference':
    case 'DocumentParsingJob':
      return {
        OR: [
          { createdById: { in: context.accessibleUserIds } },
          { updatedById: { in: context.accessibleUserIds } },
          {
            candidate: {
              OR: [
                { createdById: { in: context.accessibleUserIds } },
                {
                  applications: {
                    some: {
                      recruiterOwnerUserId: { in: context.accessibleUserIds },
                    },
                  },
                },
              ],
            },
          },
        ],
      };
    default:
      return null;
  }
}

function hasExplicitIdFilter(where: unknown): boolean {
  if (!where || typeof where !== 'object') {
    return false;
  }

  const whereRecord = where as Record<string, unknown>;
  if (typeof whereRecord.id === 'string' && whereRecord.id.length > 0) {
    return true;
  }

  if (typeof whereRecord.entityId === 'string' && whereRecord.entityId.length > 0) {
    return true;
  }

  if (Array.isArray(whereRecord.AND)) {
    return whereRecord.AND.some((item) => hasExplicitIdFilter(item));
  }

  return false;
}

function resolveEntityIdFromWhere(where: unknown): string | null {
  if (!where || typeof where !== 'object') {
    return null;
  }

  const whereRecord = where as Record<string, unknown>;
  if (typeof whereRecord.id === 'string' && whereRecord.id.length > 0) {
    return whereRecord.id;
  }

  if (typeof whereRecord.entityId === 'string' && whereRecord.entityId.length > 0) {
    return whereRecord.entityId;
  }

  if (Array.isArray(whereRecord.AND)) {
    for (const condition of whereRecord.AND) {
      const resolved = resolveEntityIdFromWhere(condition);
      if (resolved) {
        return resolved;
      }
    }
  }

  return null;
}
