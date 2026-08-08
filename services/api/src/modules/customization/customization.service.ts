import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import {
  listSupportedSystemWidgets,
  type SystemWidgetDefinition,
} from '@repo/config';
import {
  CustomizationColumn,
  CustomizationFieldDataType,
  CustomizationForm,
  CustomizationFormType,
  CustomizationSolution,
  CustomizationSolutionComponent,
  CustomizationSolutionComponentType,
  CustomizationTable,
  CustomizationView,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateModuleViewDto } from '../views/dto/create-module-view.dto';
import { UpdateModuleViewDto } from '../views/dto/update-module-view.dto';
import {
  findSystemCustomizationTable,
  isDesignerColumn,
  isViewDesignerColumn,
  SYSTEM_CUSTOMIZATION_TABLES,
  SystemTableDefinition,
} from './customization.registry';
import {
  CreateCustomizationColumnDto,
  CreateCustomizationFormDto,
  CreateCustomizationPackageDto,
  CreateCustomizationTableDto,
  CreateCustomizationViewDto,
  AddExistingPackageComponentsDto,
  EnsureCustomizationLayerDto,
  MoveCustomizationComponentsDto,
  PreviewCustomizationPackageImportDto,
  UpdateCustomizationColumnDto,
  UpdateCustomizationFormDto,
  UpdateCustomizationPackageDto,
  UpdateCustomizationTableDto,
  UpdateCustomizationViewDto,
} from './dto/customization.dto';
import { validatePackageComponentDependencies } from './dependency-validation';
import {
  buildMetadataInvalidationKeys,
  resolveEffectivePackageComponents,
} from './package-layer-runtime';

const UNASSIGNED_DRAFT_PACKAGE_KEY = 'unassigned-draft-customizations';
const UNASSIGNED_DRAFT_PACKAGE_NAME = 'Unassigned Draft Customizations';

@Injectable()
export class CustomizationService {
  private readonly syncedDefaultSolutionTenants = new Set<string>();
  private readonly defaultSolutionSyncPromises = new Map<
    string,
    Promise<CustomizationSolution>
  >();

  constructor(private readonly prisma: PrismaService) {}

  async getDefaultSolution(currentUser: AuthenticatedUser) {
    const solution = await this.syncDefaultSolution(currentUser);
    const components =
      await this.prisma.customizationSolutionComponent.findMany({
        where: { tenantId: currentUser.tenantId, solutionId: solution.id },
        orderBy: [
          { componentType: 'asc' },
          { objectKey: 'asc' },
          { updatedAt: 'desc' },
        ],
      });
    const [tables, columns, forms, views] = await Promise.all([
      this.prisma.customizationTable.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'table')
              .map((component) => component.objectId),
          },
        },
      }),
      this.prisma.customizationColumn.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'column')
              .map((component) => component.objectId),
          },
        },
      }),
      this.prisma.customizationForm.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'form')
              .map((component) => component.objectId),
          },
        },
      }),
      this.prisma.customizationView.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'view')
              .map((component) => component.objectId),
          },
        },
      }),
    ]);
    const tableById = new Map(tables.map((table) => [table.id, table]));
    const columnById = new Map(columns.map((column) => [column.id, column]));
    const formById = new Map(forms.map((form) => [form.id, form]));
    const viewById = new Map(views.map((view) => [view.id, view]));

    return {
      id: solution.id,
      solutionKey: solution.solutionKey,
      displayName: solution.displayName,
      description: solution.description,
      isDefault: solution.isDefault,
      isManaged: solution.isManaged,
      isSystem: solution.isSystem,
      updatedAt: solution.updatedAt,
      components: components.map((component) =>
        this.toSolutionComponentResponse(component, {
          table: tableById.get(component.objectId),
          column: columnById.get(component.objectId),
          form: formById.get(component.objectId),
          view: viewById.get(component.objectId),
          parentTable: component.tableId
            ? (tableById.get(component.tableId) ??
              tables.find((table) => table.id === component.tableId))
            : undefined,
        }),
      ),
    };
  }

  async getSummary(currentUser: AuthenticatedUser) {
    await this.syncDefaultSolution(currentUser);
    const [tables, tenantColumns, views, forms, snapshots] = await Promise.all([
      this.prisma.customizationTable.count({
        where: {
          tenantId: currentUser.tenantId,
          OR: [{ isCustom: true }, { isVisibleInCustomization: true }],
        },
      }),
      this.prisma.customizationColumn.count({
        where: { tenantId: currentUser.tenantId, isSystem: false },
      }),
      this.prisma.customizationView.count({
        where: { tenantId: currentUser.tenantId },
      }),
      this.prisma.customizationForm.count({
        where: { tenantId: currentUser.tenantId },
      }),
      this.prisma.customizationPublishSnapshot.count({
        where: { tenantId: currentUser.tenantId },
      }),
    ]);

    return {
      existingSystemTablesOnly: false,
      customTablesEnabled: true,
      systemTables: await this.prisma.customizationTable.count({
        where: {
          tenantId: currentUser.tenantId,
          isSystem: true,
          isVisibleInCustomization: true,
        },
      }),
      tableOverrides: tables,
      configuredTables: tables,
      tenantColumns,
      views,
      tenantForms: forms,
      publishSnapshots: snapshots,
    };
  }

  async listTables(currentUser: AuthenticatedUser) {
    await this.syncDefaultSolution(currentUser);
    return this.buildTableResponses(currentUser);
  }

  async getTable(currentUser: AuthenticatedUser, tableKey: string) {
    await this.syncDefaultSolution(currentUser);
    const [table] = await this.buildTableResponses(currentUser, [tableKey]);
    if (!table) {
      throw new NotFoundException('Customization table was not found.');
    }

    return table;
  }

  async createTable(
    currentUser: AuthenticatedUser,
    dto: CreateCustomizationTableDto,
  ) {
    const packageRecord = await this.resolveLayerPackage(
      currentUser,
      dto.packageId,
    );
    if (findSystemCustomizationTable(dto.tableKey)) {
      throw new ConflictException('A system table already uses this key.');
    }

    const tableKey = dto.tableKey.trim();
    const existing = await this.prisma.customizationTable.findUnique({
      where: {
        tenantId_tableKey: {
          tenantId: currentUser.tenantId,
          tableKey,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'A customization table already uses this key.',
      );
    }

    const table = await this.prisma.customizationTable.create({
      data: {
        tenantId: currentUser.tenantId,
        tableKey,
        systemName: dto.systemName?.trim() || pascalize(tableKey),
        displayName: dto.displayName.trim(),
        pluralDisplayName: dto.pluralDisplayName.trim(),
        description: dto.description?.trim(),
        icon: dto.icon?.trim(),
        moduleKey: 'custom',
        displayOrder: 9000,
        ownershipType: 'tenant',
        isSystem: false,
        isCustom: true,
        isCustomizable: true,
        isVisibleInCustomization: true,
        isValidForAdvancedFind: true,
        isValidForFormDesigner: true,
        isValidForViewDesigner: true,
        isActive: dto.isActive ?? true,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
    });
    await this.addDefaultSolutionComponent(currentUser, {
      solutionId: packageRecord.id,
      componentType: 'table',
      objectId: table.id,
      objectKey: table.tableKey,
      tableId: table.id,
      isSystem: false,
      isCustom: true,
    });
    return table;
  }

  async getPublished(currentUser: AuthenticatedUser) {
    const snapshot = await this.prisma.customizationPublishSnapshot.findFirst({
      where: { tenantId: currentUser.tenantId, status: 'published' },
      orderBy: { version: 'desc' },
    });

    if (!snapshot) {
      return {
        published: false,
        version: null,
        publishedAt: null,
        snapshotJson: null,
      };
    }

    return {
      published: true,
      id: snapshot.id,
      version: snapshot.version,
      publishedAt: snapshot.publishedAt,
      publishedByUserId: snapshot.publishedByUserId,
      snapshotJson: normalizePublishedSnapshot(snapshot.snapshotJson),
    };
  }

  async getPublishHistory(currentUser: AuthenticatedUser) {
    const snapshots = await this.prisma.customizationPublishSnapshot.findMany({
      where: { tenantId: currentUser.tenantId },
      orderBy: { version: 'desc' },
      take: 25,
      select: {
        id: true,
        version: true,
        status: true,
        publishedByUserId: true,
        publishedAt: true,
        createdAt: true,
      },
    });
    const userIds = [
      ...new Set(
        snapshots
          .map((snapshot) => snapshot.publishedByUserId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId: currentUser.tenantId, id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    return snapshots.map((snapshot) => {
      const user = snapshot.publishedByUserId
        ? userById.get(snapshot.publishedByUserId)
        : null;

      return {
        ...snapshot,
        publishedByName: user
          ? `${user.firstName} ${user.lastName}`.trim() || user.email
          : null,
        publishedByEmail: user?.email ?? null,
      };
    });
  }

  async listPackages(currentUser: AuthenticatedUser) {
    await this.syncDefaultSolution(currentUser);
    const packages = await this.prisma.customizationSolution.findMany({
      where: { tenantId: currentUser.tenantId },
      include: { components: { select: { lifecycleState: true } } },
      orderBy: [{ isDefault: 'desc' }, { displayName: 'asc' }],
    });
    return packages.map((record) =>
      this.toPackageResponse(
        currentUser,
        record,
        this.summarizePackageComponents(record.components),
      ),
    );
  }

  async listPublishDraftComponents(currentUser: AuthenticatedUser) {
    await this.syncDefaultSolution(currentUser);
    const packages = await this.prisma.customizationSolution.findMany({
      where: {
        tenantId: currentUser.tenantId,
        isDefault: false,
      },
      orderBy: { displayName: 'asc' },
    });
    const packageById = new Map(packages.map((item) => [item.id, item]));
    const componentRows =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          solutionId: { in: packages.map((item) => item.id) },
          lifecycleState: 'draft',
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    const components = await Promise.all(
      packages.map((item) => this.getPackageComponents(currentUser, item.id)),
    );
    const componentById = new Map(
      components.flat().map((component) => [component.id, component]),
    );

    return componentRows.map((component) => {
      const packageRecord = packageById.get(component.solutionId);
      const detail = componentById.get(component.id);
      return {
        id: component.id,
        componentId: component.id,
        objectId: component.objectId,
        componentName: detail?.displayName ?? component.objectKey,
        componentType: component.componentType,
        module: detail?.tableDisplayName ?? detail?.tableKey ?? 'Global',
        packageId: component.solutionId,
        packageKey: packageRecord?.solutionKey ?? null,
        packageName: packageRecord?.displayName ?? 'Custom Package',
        layerAction: component.layerAction,
        lifecycleState: component.lifecycleState,
        modifiedOn: component.updatedAt,
        issues: [],
        isSystem: component.isSystem,
        isCustom: component.isCustom,
      };
    });
  }

  async validatePublishDrafts(
    currentUser: AuthenticatedUser,
    componentIds?: string[],
  ) {
    const drafts = await this.listPublishDraftComponents(currentUser);
    const selectedIds = new Set(componentIds?.filter(Boolean) ?? []);
    const scopedDrafts = selectedIds.size
      ? drafts.filter((draft) => selectedIds.has(draft.id))
      : drafts;
    if (selectedIds.size && scopedDrafts.length !== selectedIds.size) {
      throw new BadRequestException(
        'One or more selected components are not draft components.',
      );
    }
    const scopedRows =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: { in: scopedDrafts.map((draft) => draft.id) },
          lifecycleState: 'draft',
        },
      });
    const publishedRows =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          lifecycleState: 'published',
        },
        select: {
          id: true,
          objectId: true,
          objectKey: true,
        },
      });
    const duplicateKeys = findDuplicates(
      scopedDrafts.map(
        (item) => `${item.packageId}:${item.componentType}:${item.objectId}`,
      ),
    );
    const issues = validatePackageComponentDependencies({
      components: scopedRows.map((item) => ({
        id: item.id,
        componentType: item.componentType,
        objectId: item.objectId,
        objectKey: item.objectKey,
        tableId: item.tableId,
        isSystem: item.isSystem,
        isCustom: item.isCustom,
        metadataJson: item.metadataJson,
      })),
      duplicateKeys,
      availableComponentKeys: publishedRows.flatMap((item) => [
        item.id,
        item.objectId,
        item.objectKey,
      ]),
      referencedFieldKeys: scopedDrafts
        .filter((item) => item.componentType === 'column')
        .map((item) => item.componentName),
      defaultComponentKeys: scopedDrafts
        .filter(
          (item) =>
            item.componentType === 'form' || item.componentType === 'view',
        )
        .map((item) => item.componentName),
    });

    return {
      valid: !issues.some((issue) => issue.blocking),
      issues,
    };
  }

  async ensureCustomizationLayer(
    currentUser: AuthenticatedUser,
    dto: EnsureCustomizationLayerDto,
  ) {
    await this.syncDefaultSolution(currentUser);
    const packageRecord = dto.packageId
      ? await this.findPackageOrThrow(currentUser, dto.packageId)
      : await this.getOrCreateUnassignedDraftPackage(currentUser);
    if (packageRecord.isDefault || packageRecord.isSystem) {
      throw new BadRequestException(
        'Default Package cannot contain customization layers.',
      );
    }

    const componentType = toSolutionComponentType(dto.componentType);
    if (!componentType) {
      throw new BadRequestException(
        'This component type is not backed by metadata storage yet.',
      );
    }
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      dto.moduleKey,
    );
    const objectKey = dto.componentKey.includes('.')
      ? dto.componentKey
      : `${table.tableKey}.${dto.componentKey}`;
    const existingComponent =
      await this.prisma.customizationSolutionComponent.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          solutionId: packageRecord.id,
          componentType,
          objectKey,
          lifecycleState: 'draft',
        },
      });
    if (existingComponent) {
      const updated = await this.prisma.customizationSolutionComponent.update({
        where: { id: existingComponent.id },
        data: {
          ...(dto.metadataJson !== undefined
            ? { metadataJson: dto.metadataJson as Prisma.InputJsonValue }
            : {}),
          ...(dto.displayName
            ? {
                metadataJson: {
                  ...((existingComponent.metadataJson as Record<
                    string,
                    unknown
                  > | null) ?? {}),
                  displayName: dto.displayName,
                  ...(dto.metadataJson ?? {}),
                },
              }
            : {}),
          updatedByUserId: currentUser.userId,
        },
      });
      return {
        packageId: packageRecord.id,
        packageName: packageRecord.displayName,
        component: updated,
      };
    }

    const base = await this.findComponentBase(
      currentUser,
      componentType,
      table.id,
      dto.componentKey,
    );
    const component = await this.addDefaultSolutionComponent(currentUser, {
      solutionId: packageRecord.id,
      componentType,
      objectId: base.objectId,
      objectKey,
      tableId: table.id,
      isSystem: base.isSystem,
      isCustom: true,
      baseComponentId: base.baseComponentId,
      layerAction: dto.layerAction ?? 'modify',
      lifecycleState: 'draft',
      layerOrder: 300,
      metadataJson: {
        source: base.isSystem ? 'effective-system' : 'custom',
        componentKey: objectKey,
        displayName: dto.displayName ?? localComponentName(dto.componentKey),
        ...(dto.metadataJson ?? {}),
      },
    });

    return {
      packageId: packageRecord.id,
      packageName: packageRecord.displayName,
      component,
    };
  }

  async listModuleMetadataComponents(
    currentUser: AuthenticatedUser,
    tableKey: string,
    componentTypeInput: string,
  ) {
    await this.syncDefaultSolution(currentUser);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const componentType = toSolutionComponentType(componentTypeInput);
    if (!componentType) {
      throw new BadRequestException('Unsupported metadata component type.');
    }
    const components =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          componentType,
        },
        include: { solution: true },
        orderBy: [{ updatedAt: 'desc' }],
      });

    return components.map((component) => {
      const metadata =
        (component.metadataJson as Record<string, unknown> | null) ?? {};
      return {
        id: component.id,
        componentType: component.componentType,
        componentKey: component.objectKey,
        logicalName:
          component.objectKey.split('.').pop() ?? component.objectKey,
        displayName:
          typeof metadata.displayName === 'string'
            ? metadata.displayName
            : component.objectKey,
        packageId: component.solutionId,
        packageName: component.solution.displayName,
        packageKey: component.solution.solutionKey,
        layerAction: component.layerAction,
        lifecycleState: component.lifecycleState,
        source: component.isSystem ? 'System' : 'Custom',
        isSystem: component.isSystem,
        isCustom: component.isCustom,
        isActive: metadata.isActive !== false,
        metadataJson: metadata,
        updatedAt: component.updatedAt,
      };
    });
  }

  async moveDraftComponents(
    currentUser: AuthenticatedUser,
    dto: MoveCustomizationComponentsDto,
  ) {
    const componentIds = [...new Set(dto.componentIds.filter(Boolean))];
    if (!componentIds.length) {
      throw new BadRequestException('Select at least one draft component.');
    }
    const target = await this.findPackageOrThrow(
      currentUser,
      dto.targetPackageId,
    );
    if (target.isDefault || target.isSystem) {
      throw new BadRequestException(
        'Draft components cannot be moved into Default Package.',
      );
    }
    if (target.solutionKey === UNASSIGNED_DRAFT_PACKAGE_KEY) {
      throw new BadRequestException(
        'Select a real Custom Package as the move target.',
      );
    }
    const components =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: { in: componentIds },
          lifecycleState: 'draft',
        },
      });
    if (components.length !== componentIds.length) {
      throw new BadRequestException(
        'Only draft components can be moved between packages.',
      );
    }
    const duplicate =
      await this.prisma.customizationSolutionComponent.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          solutionId: target.id,
          OR: components.map((component) => ({
            componentType: component.componentType,
            objectId: component.objectId,
          })),
        },
      });
    if (duplicate) {
      throw new ConflictException(
        'The target package already contains one or more selected components.',
      );
    }

    await this.prisma.customizationSolutionComponent.updateMany({
      where: {
        tenantId: currentUser.tenantId,
        id: { in: componentIds },
        lifecycleState: 'draft',
      },
      data: {
        solutionId: target.id,
        updatedByUserId: currentUser.userId,
      },
    });

    return {
      moved: true,
      count: components.length,
      targetPackageId: target.id,
    };
  }

  async publishComponents(
    currentUser: AuthenticatedUser,
    componentIds: string[],
  ) {
    await this.syncDefaultSolution(currentUser);
    const selectedIds = [...new Set(componentIds.filter(Boolean))];
    if (!selectedIds.length) {
      throw new BadRequestException(
        'Select at least one draft component to publish.',
      );
    }

    const validation = await this.validatePublishDrafts(
      currentUser,
      selectedIds,
    );
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Publish is blocked by validation issues.',
        issues: validation.issues,
      });
    }

    const drafts = await this.prisma.customizationSolutionComponent.findMany({
      where: {
        tenantId: currentUser.tenantId,
        id: { in: selectedIds },
        lifecycleState: 'draft',
      },
      include: { solution: true },
    });
    if (drafts.length !== selectedIds.length) {
      throw new BadRequestException(
        'One or more selected components are no longer draft components.',
      );
    }
    if (
      drafts.some(
        (component) =>
          component.solution.solutionKey === UNASSIGNED_DRAFT_PACKAGE_KEY,
      )
    ) {
      throw new BadRequestException(
        'Move unassigned draft customizations to a Custom Package before publishing.',
      );
    }

    const publishedAt = new Date();
    await Promise.all(
      drafts.map((component) =>
        this.prisma.customizationSolutionComponent.update({
          where: { id: component.id },
          data: {
            lifecycleState: 'published',
            publishedAt,
            publishedByUserId: currentUser.userId,
            updatedByUserId: currentUser.userId,
            version: nextPatchVersion(component.version),
            checksum: checksumFor({
              componentType: component.componentType,
              objectId: component.objectId,
              objectKey: component.objectKey,
              tableId: component.tableId,
              layerAction: component.layerAction,
              metadataJson: component.metadataJson,
            }),
          },
        }),
      ),
    );

    const effectiveMetadata = await this.getEffectiveMetadata(currentUser);
    const latestSnapshot =
      await this.prisma.customizationPublishSnapshot.findFirst({
        where: { tenantId: currentUser.tenantId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
    const snapshotVersion = (latestSnapshot?.version ?? 0) + 1;
    await this.prisma.customizationPublishSnapshot.create({
      data: {
        tenantId: currentUser.tenantId,
        version: snapshotVersion,
        status: 'published',
        publishedAt,
        publishedByUserId: currentUser.userId,
        snapshotJson: toJsonValue({
          ...effectiveMetadata,
          publishedComponentIds: selectedIds,
          effectiveMetadata,
        }),
      },
    });

    const affectedPackageIds = [
      ...new Set(drafts.map((draft) => draft.solutionId)),
    ];
    const packageSummaries = await this.getPackageStateSummaries(
      currentUser,
      affectedPackageIds,
    );
    const invalidationKeys = buildMetadataInvalidationKeys({
      tenantId: currentUser.tenantId,
      packageIds: affectedPackageIds,
      componentTypes: drafts.map((draft) => draft.componentType),
      moduleIds: drafts
        .map((draft) => draft.tableId)
        .filter((value): value is string => Boolean(value)),
      snapshotVersion,
    });

    return {
      published: true,
      count: drafts.length,
      snapshotVersion,
      publishedAt,
      invalidationKeys,
      packages: packageSummaries,
      diagnostics: {
        packageIds: affectedPackageIds,
        componentIds: selectedIds,
        validation,
        invalidationKeys,
      },
    };
  }

  async getEffectiveMetadata(currentUser: AuthenticatedUser) {
    await this.syncDefaultSolution(currentUser);
    const publishedComponents =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          lifecycleState: 'published',
        },
        orderBy: [
          { layerOrder: 'asc' },
          { componentType: 'asc' },
          { objectKey: 'asc' },
        ],
      });
    const components = resolveEffectivePackageComponents(publishedComponents);

    const [tables, columns, forms, views] = await Promise.all([
      this.prisma.customizationTable.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'table')
              .map((component) => component.objectId),
          },
        },
      }),
      this.prisma.customizationColumn.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'column')
              .map((component) => component.objectId),
          },
        },
      }),
      this.prisma.customizationForm.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'form')
              .map((component) => component.objectId),
          },
        },
      }),
      this.prisma.customizationView.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: {
            in: components
              .filter((component) => component.componentType === 'view')
              .map((component) => component.objectId),
          },
        },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      components: components.map((component) => ({
        id: component.id,
        componentType: component.componentType,
        objectId: component.objectId,
        objectKey: component.objectKey,
        baseComponentId: component.baseComponentId,
        layerAction: component.layerAction,
        lifecycleState: component.lifecycleState,
        layerOrder: component.layerOrder,
        version: component.version,
        checksum: component.checksum,
        metadataJson: component.metadataJson,
      })),
      modules: tables,
      fields: columns,
      forms,
      views,
    };
  }

  async getPackage(currentUser: AuthenticatedUser, packageId: string) {
    await this.syncDefaultSolution(currentUser);
    const record = await this.findPackageOrThrow(currentUser, packageId);
    const components = await this.getPackageComponents(currentUser, record.id);
    const componentRows =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          solutionId: record.id,
        },
      });
    const rowById = new Map(
      componentRows.map((component) => [component.id, component]),
    );
    const componentsWithDependencies = await Promise.all(
      components.map(async (component) => {
        const row = rowById.get(component.id);
        if (
          !row ||
          row.isSystem ||
          row.isManaged ||
          !row.isCustom ||
          !['column', 'form', 'view'].includes(row.componentType)
        ) {
          return component;
        }
        const dependencies = await this.findMetadataDeleteDependencies(
          currentUser,
          row,
        );
        return {
          ...component,
          dependencies: dependencies.map((issue) => issue.message),
        };
      }),
    );
    const validation = await this.validatePackage(currentUser, record.id);
    return {
      ...this.toPackageResponse(
        currentUser,
        record,
        this.summarizePackageComponents(componentsWithDependencies),
      ),
      components: componentsWithDependencies,
      diagnostics: validation,
    };
  }

  async validatePackage(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    const rows = await this.prisma.customizationSolutionComponent.findMany({
      where: {
        tenantId: currentUser.tenantId,
        solutionId: record.id,
      },
    });
    const draftRows = rows.filter(
      (component) => component.lifecycleState === 'draft',
    );
    const duplicateKeys = findDuplicates(
      rows.map((item) => `${item.componentType}:${item.objectId}`),
    );
    const baseComponentIds = rows
      .map((item) => item.baseComponentId)
      .filter((value): value is string => Boolean(value));
    const existingBaseComponents = baseComponentIds.length
      ? await this.prisma.customizationSolutionComponent.findMany({
          where: {
            tenantId: currentUser.tenantId,
            OR: [
              { id: { in: baseComponentIds } },
              { objectId: { in: baseComponentIds } },
            ],
          },
          select: { id: true, objectId: true },
        })
      : [];
    const existingBaseIds = new Set(
      existingBaseComponents.flatMap((item) => [item.id, item.objectId]),
    );
    const missingBaseComponentKeys = rows
      .filter(
        (item) =>
          item.layerAction === 'modify' &&
          item.baseComponentId &&
          !existingBaseIds.has(item.baseComponentId),
      )
      .map((item) => item.objectKey);
    const issues = validatePackageComponentDependencies({
      components: rows.map((item) => ({
        id: item.id,
        componentType: item.componentType,
        objectId: item.objectId,
        objectKey: item.objectKey,
        tableId: item.tableId,
        isSystem: item.isSystem,
        isCustom: item.isCustom,
        metadataJson: item.metadataJson,
      })),
      duplicateKeys,
      missingBaseComponentKeys,
      defaultComponentKeys: rows
        .filter(
          (item) =>
            item.componentType === 'form' || item.componentType === 'view',
        )
        .map((item) => item.objectKey),
      referencedFieldKeys: rows
        .filter((item) => item.componentType === 'column')
        .map((item) => item.objectKey),
    });
    const moduleObjectIds = new Set(
      rows
        .filter((item) => item.componentType === 'table')
        .map((item) => item.objectId),
    );
    for (const component of rows) {
      if (
        component.componentType !== 'table' &&
        component.tableId &&
        !moduleObjectIds.has(component.tableId)
      ) {
        issues.push({
          severity: 'error',
          componentId: component.id,
          componentType: component.componentType,
          message: `${component.objectKey} is missing its parent Module membership in this Package.`,
          blocking: true,
        });
      }
    }

    if (record.isDefault || record.isSystem) {
      issues.push({
        severity: 'info',
        componentId: null,
        componentType: null,
        message: 'Default/System Package cannot be deleted.',
        blocking: false,
      });
    } else if (record.isManaged) {
      issues.push({
        severity: 'info',
        componentId: null,
        componentType: null,
        message: 'Managed packages cannot be deleted.',
        blocking: false,
      });
    } else if (
      rows.some((component) => component.lifecycleState === 'published')
    ) {
      issues.push({
        severity: 'info',
        componentId: null,
        componentType: null,
        message:
          'Package cannot be deleted while published package components exist. Retire or replace the published metadata first.',
        blocking: false,
      });
    }
    if (!record.isDefault && draftRows.length === 0) {
      issues.push({
        severity: 'info',
        componentId: null,
        componentType: null,
        message: 'No draft components are pending publish.',
        blocking: false,
      });
    }

    return {
      valid: !issues.some((issue) => issue.blocking),
      issues,
      draftComponentsCount: draftRows.length,
      publishedComponentsCount: rows.length - draftRows.length,
      unsupportedComponentTypes: [
        'Related Lists',
        'Actions',
        'Rules',
        'Automations',
        'Guided Processes',
        'Timeline Templates',
        'Document Metadata',
      ],
      missingHandlers: [],
      permissionIssues: [],
    };
  }

  async publishPackage(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    if (record.isDefault || record.isSystem) {
      throw new BadRequestException('Default Package is read-only.');
    }
    if (record.isManaged) {
      throw new BadRequestException(
        'Managed packages cannot be published from this editor.',
      );
    }
    if (record.solutionKey === UNASSIGNED_DRAFT_PACKAGE_KEY) {
      throw new BadRequestException(
        'Move unassigned draft customizations to a Custom Package before publishing.',
      );
    }
    const validation = await this.validatePackage(currentUser, record.id);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Publish is blocked by package validation errors.',
        issues: validation.issues,
      });
    }
    const drafts = await this.prisma.customizationSolutionComponent.findMany({
      where: {
        tenantId: currentUser.tenantId,
        solutionId: record.id,
        lifecycleState: 'draft',
      },
      select: { id: true },
    });
    if (!drafts.length) {
      throw new BadRequestException('No draft components are pending publish.');
    }

    const result = await this.publishComponents(
      currentUser,
      drafts.map((component) => component.id),
    );
    return {
      ...result,
      packageId: record.id,
      invalidationKeys: [
        `metadata:${currentUser.tenantId}`,
        `package:${record.id}`,
      ],
    };
  }

  async removeComponentFromPackage(
    currentUser: AuthenticatedUser,
    packageId: string,
    componentId: string,
  ) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    if (record.isDefault || record.isSystem) {
      throw new BadRequestException('Default Package is read-only.');
    }
    const component =
      await this.prisma.customizationSolutionComponent.findFirst({
        where: {
          id: componentId,
          tenantId: currentUser.tenantId,
          solutionId: record.id,
        },
      });
    if (!component) {
      throw new NotFoundException('Package component was not found.');
    }
    if (component.componentType === 'table') {
      const childCount = await this.prisma.customizationSolutionComponent.count(
        {
          where: {
            tenantId: currentUser.tenantId,
            solutionId: record.id,
            tableId: component.objectId,
            id: { not: component.id },
          },
        },
      );
      if (childCount > 0) {
        throw new BadRequestException(
          `Cannot remove Module "${component.objectKey}" while ${childCount} child component${childCount === 1 ? '' : 's'} remain in this Package. Remove the child components first.`,
        );
      }
    }
    await this.prisma.customizationSolutionComponent.delete({
      where: { id: component.id },
    });
    return { removed: true, componentId: component.id };
  }

  async deletePackageComponentMetadata(
    currentUser: AuthenticatedUser,
    packageId: string,
    componentId: string,
  ) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    if (record.isDefault || record.isSystem || record.isManaged) {
      throw new BadRequestException(
        'System, Default Package, and managed components cannot be deleted.',
      );
    }
    const component =
      await this.prisma.customizationSolutionComponent.findFirst({
        where: {
          id: componentId,
          tenantId: currentUser.tenantId,
          solutionId: record.id,
        },
      });
    if (!component) {
      throw new NotFoundException('Package component was not found.');
    }
    if (component.isSystem || component.isManaged || !component.isCustom) {
      throw new BadRequestException(
        'System-owned or managed components cannot be deleted.',
      );
    }
    if (component.componentType === 'table') {
      throw new BadRequestException(
        'Modules are retired through lifecycle management; they are not hard-deleted from Package customization.',
      );
    }
    const dependencyIssues = await this.findMetadataDeleteDependencies(
      currentUser,
      component,
    );
    if (dependencyIssues.length) {
      throw new BadRequestException({
        message: `Cannot delete ${component.objectKey} because it is still in use. Remove it from dependent metadata first, then try again.`,
        issues: dependencyIssues,
      });
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.customizationSolutionComponent.deleteMany({
        where: {
          tenantId: currentUser.tenantId,
          componentType: component.componentType,
          objectId: component.objectId,
        },
      });
      if (component.componentType === 'column') {
        await transaction.customizationColumn.delete({
          where: { id: component.objectId },
        });
      } else if (component.componentType === 'form') {
        await transaction.customizationForm.delete({
          where: { id: component.objectId },
        });
      } else if (component.componentType === 'view') {
        await transaction.customizationView.delete({
          where: { id: component.objectId },
        });
      } else {
        throw new BadRequestException(
          'This component type is not storage-backed for deletion yet.',
        );
      }
    });

    return { deleted: true, componentId: component.id };
  }

  async createPackage(
    currentUser: AuthenticatedUser,
    dto: CreateCustomizationPackageDto,
  ) {
    await this.syncDefaultSolution(currentUser);
    if (dto.packageKey === 'default') {
      throw new BadRequestException('Cannot create another Default Package.');
    }
    const existing = await this.prisma.customizationSolution.findUnique({
      where: {
        tenantId_solutionKey: {
          tenantId: currentUser.tenantId,
          solutionKey: dto.packageKey,
        },
      },
    });
    if (existing) {
      throw new ConflictException('A package already uses this key.');
    }
    const publisherName = dto.publisherName.trim();
    if (!publisherName) {
      throw new BadRequestException('Custom Package publisher is required.');
    }
    const prefix = await this.uniquePublisherPrefix(currentUser, publisherName);
    const packageKey = await this.uniquePackageKey(
      currentUser,
      `${prefix}${camelize(dto.displayName)}`,
    );
    const record = await this.prisma.customizationSolution.create({
      data: {
        tenantId: currentUser.tenantId,
        solutionKey: packageKey,
        displayName: dto.displayName.trim(),
        description: dto.description?.trim(),
        scope: 'tenant',
        isDefault: false,
        isSystem: false,
        isManaged: false,
        isActive: true,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
    });
    return this.toPackageResponse(
      currentUser,
      record,
      this.summarizePackageComponents([]),
      dto.version,
      publisherName,
    );
  }

  async updatePackage(
    currentUser: AuthenticatedUser,
    packageId: string,
    dto: UpdateCustomizationPackageDto,
  ) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    if (record.isDefault || record.isSystem) {
      throw new BadRequestException('Default Package is read-only.');
    }
    const updated = await this.prisma.customizationSolution.update({
      where: { id: record.id },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        updatedByUserId: currentUser.userId,
      },
    });
    const components =
      await this.prisma.customizationSolutionComponent.findMany({
        where: { solutionId: updated.id },
        select: { lifecycleState: true },
      });
    return this.toPackageResponse(
      currentUser,
      updated,
      this.summarizePackageComponents(components),
    );
  }

  async deletePackage(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    if (record.isDefault || record.isSystem) {
      throw new BadRequestException(
        'Default/System Package cannot be deleted.',
      );
    }
    if (record.isManaged) {
      throw new BadRequestException('Managed packages cannot be deleted.');
    }
    const componentCount =
      await this.prisma.customizationSolutionComponent.count({
        where: { solutionId: record.id, lifecycleState: 'published' },
      });
    if (componentCount > 0) {
      throw new BadRequestException(
        'Package cannot be deleted while published package components exist. Retire or replace the published metadata first.',
      );
    }
    await this.prisma.customizationSolution.delete({
      where: { id: record.id },
    });
    return {
      deleted: true,
      message: 'Package was deleted from customization workspace.',
    };
  }

  async listPackageComponentCandidates(
    currentUser: AuthenticatedUser,
    input: {
      packageId: string;
      moduleKey?: string;
      componentType?: string;
    },
  ) {
    const record = await this.findPackageOrThrow(currentUser, input.packageId);
    const existing = await this.prisma.customizationSolutionComponent.findMany({
      where: { solutionId: record.id },
      select: { componentType: true, objectId: true },
    });
    const existingKeys = new Set(
      existing.map((item) => `${item.componentType}:${item.objectId}`),
    );
    const tables = await this.prisma.customizationTable.findMany({
      where: {
        tenantId: currentUser.tenantId,
        ...(input.moduleKey ? { tableKey: input.moduleKey } : {}),
      },
      orderBy: { displayName: 'asc' },
    });
    const tableIds = tables.map((table) => table.id);
    const tableById = new Map(tables.map((table) => [table.id, table]));
    const candidates: Array<{
      objectId: string;
      objectKey: string;
      displayName: string;
      componentType: CustomizationSolutionComponentType;
      moduleKey: string | null;
      moduleDisplayName: string | null;
      isSystem: boolean;
      isCustom: boolean;
      dependencies: string[];
      alreadyInPackage: boolean;
    }> = [];
    const requestedType = toSolutionComponentType(input.componentType);

    if (!requestedType || requestedType === 'table') {
      candidates.push(
        ...tables.map((table) => ({
          objectId: table.id,
          objectKey: table.tableKey,
          displayName: table.displayName,
          componentType: 'table' as const,
          moduleKey: table.tableKey,
          moduleDisplayName: table.displayName,
          isSystem: table.isSystem,
          isCustom: table.isCustom,
          dependencies: [],
          alreadyInPackage: existingKeys.has(`table:${table.id}`),
        })),
      );
    }
    if (!requestedType || requestedType === 'column') {
      const columns = await this.prisma.customizationColumn.findMany({
        where: { tenantId: currentUser.tenantId, tableId: { in: tableIds } },
        orderBy: { displayName: 'asc' },
      });
      candidates.push(
        ...columns.map((column) => {
          const table = tableById.get(column.tableId);
          return {
            objectId: column.id,
            objectKey: `${table?.tableKey ?? column.tableId}.${column.columnKey}`,
            displayName: column.displayName,
            componentType: 'column' as const,
            moduleKey: table?.tableKey ?? null,
            moduleDisplayName: table?.displayName ?? null,
            isSystem: column.isSystem,
            isCustom: column.isCustom,
            dependencies: column.lookupTargetTableKey
              ? [column.lookupTargetTableKey]
              : [],
            alreadyInPackage: existingKeys.has(`column:${column.id}`),
          };
        }),
      );
    }
    if (!requestedType || requestedType === 'form') {
      const forms = await this.prisma.customizationForm.findMany({
        where: { tenantId: currentUser.tenantId, tableId: { in: tableIds } },
        orderBy: { name: 'asc' },
      });
      candidates.push(
        ...forms.map((form) => {
          const table = tableById.get(form.tableId);
          return {
            objectId: form.id,
            objectKey: `${table?.tableKey ?? form.tableId}.${form.formKey}`,
            displayName: form.name,
            componentType: 'form' as const,
            moduleKey: table?.tableKey ?? null,
            moduleDisplayName: table?.displayName ?? null,
            isSystem: form.isSystem,
            isCustom: form.isCustom,
            dependencies: [],
            alreadyInPackage: existingKeys.has(`form:${form.id}`),
          };
        }),
      );
    }
    if (!requestedType || requestedType === 'view') {
      const views = await this.prisma.customizationView.findMany({
        where: { tenantId: currentUser.tenantId, tableId: { in: tableIds } },
        orderBy: { name: 'asc' },
      });
      candidates.push(
        ...views.map((view) => {
          const table = tableById.get(view.tableId);
          return {
            objectId: view.id,
            objectKey: `${table?.tableKey ?? view.tableId}.${view.viewKey}`,
            displayName: view.name,
            componentType: 'view' as const,
            moduleKey: table?.tableKey ?? null,
            moduleDisplayName: table?.displayName ?? null,
            isSystem: view.isSystem,
            isCustom: view.isCustom,
            dependencies: [],
            alreadyInPackage: existingKeys.has(`view:${view.id}`),
          };
        }),
      );
    }
    if (!requestedType || requestedType === 'widget') {
      for (const table of tables) {
        for (const widget of listSupportedSystemWidgets(table.tableKey)) {
          const objectId = systemWidgetObjectId(
            table.tableKey,
            widget.widgetKey,
          );
          candidates.push({
            objectId,
            objectKey: `${table.tableKey}.${widget.widgetKey}`,
            displayName: widget.displayName,
            componentType: 'widget',
            moduleKey: table.tableKey,
            moduleDisplayName: table.displayName,
            isSystem: true,
            isCustom: false,
            dependencies: [table.tableKey],
            alreadyInPackage: existingKeys.has(`widget:${objectId}`),
          });
        }
      }
    }

    return candidates;
  }

  async addExistingComponentsToPackage(
    currentUser: AuthenticatedUser,
    packageId: string,
    dto: AddExistingPackageComponentsDto,
  ) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    if (record.isDefault || record.isSystem) {
      throw new BadRequestException('Default Package is read-only.');
    }
    const componentType = toSolutionComponentType(dto.componentType);
    if (!componentType) {
      throw new BadRequestException(
        'This component type is not backed by metadata storage yet.',
      );
    }
    const components = await this.resolvePackageObjects(
      currentUser,
      componentType,
      dto.objectIds,
    );
    for (const component of components) {
      if (componentType !== 'table' && component.tableId) {
        const parentModule = await this.prisma.customizationTable.findFirst({
          where: {
            id: component.tableId,
            tenantId: currentUser.tenantId,
          },
        });
        if (parentModule) {
          await this.addDefaultSolutionComponent(currentUser, {
            solutionId: record.id,
            componentType: 'table',
            objectId: parentModule.id,
            objectKey: parentModule.tableKey,
            tableId: parentModule.id,
            isSystem: parentModule.isSystem,
            isCustom: parentModule.isCustom,
            baseComponentId: parentModule.isSystem ? parentModule.id : null,
            layerAction: parentModule.isSystem ? 'reference' : 'reference',
            lifecycleState: 'draft',
            layerOrder: 200,
            metadataJson: {
              sourceComponentType: 'table',
              sourceObjectId: parentModule.id,
              sourceObjectKey: parentModule.tableKey,
              autoAddedForChildComponent: true,
            },
          });
        }
      }
      await this.addDefaultSolutionComponent(currentUser, {
        solutionId: record.id,
        componentType,
        objectId: component.objectId,
        objectKey: component.objectKey,
        tableId: component.tableId,
        isSystem: component.isSystem,
        isCustom: component.isCustom,
        baseComponentId: component.isSystem ? component.objectId : null,
        layerAction: component.isSystem ? 'modify' : 'reference',
        lifecycleState: 'draft',
        layerOrder: component.isSystem ? 300 : 250,
        metadataJson: {
          sourceComponentType: componentType,
          sourceObjectId: component.objectId,
          sourceObjectKey: component.objectKey,
          ...('metadataJson' in component &&
          component.metadataJson &&
          typeof component.metadataJson === 'object' &&
          !Array.isArray(component.metadataJson)
            ? component.metadataJson
            : {}),
        },
      });
    }
    return this.getPackage(currentUser, record.id);
  }

  private async findMetadataDeleteDependencies(
    currentUser: AuthenticatedUser,
    component: CustomizationSolutionComponent,
  ) {
    const issues: Array<{
      severity: 'error';
      componentId: string;
      componentType: string;
      message: string;
      blocking: true;
    }> = [];
    const publishedMembership =
      await this.prisma.customizationSolutionComponent.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          componentType: component.componentType,
          objectId: component.objectId,
          lifecycleState: 'published',
        },
      });
    if (publishedMembership) {
      issues.push({
        severity: 'error',
        componentId: component.id,
        componentType: component.componentType,
        message:
          'This component is present in published runtime metadata. Replace or retire the published dependency before deletion.',
        blocking: true,
      });
    }

    if (component.componentType === 'column') {
      const field = await this.prisma.customizationColumn.findFirst({
        where: {
          id: component.objectId,
          tenantId: currentUser.tenantId,
        },
        include: { table: true },
      });
      if (!field) return issues;
      const [forms, views, metadataComponents] = await Promise.all([
        this.prisma.customizationForm.findMany({
          where: {
            tenantId: currentUser.tenantId,
            tableId: field.tableId,
          },
          select: { id: true, name: true, layoutJson: true },
        }),
        this.prisma.customizationView.findMany({
          where: {
            tenantId: currentUser.tenantId,
            tableId: field.tableId,
          },
          select: {
            id: true,
            name: true,
            columnsJson: true,
            filtersJson: true,
            sortingJson: true,
          },
        }),
        this.prisma.customizationSolutionComponent.findMany({
          where: {
            tenantId: currentUser.tenantId,
            tableId: field.tableId,
            id: { not: component.id },
          },
          select: {
            id: true,
            componentType: true,
            objectKey: true,
            metadataJson: true,
          },
        }),
      ]);
      const fieldKeys = [field.columnKey, component.objectKey];
      for (const form of forms) {
        if (jsonReferencesAny(form.layoutJson, fieldKeys)) {
          issues.push({
            severity: 'error',
            componentId: form.id,
            componentType: 'form',
            message: `Field "${field.displayName}" is used in Form "${form.name}".`,
            blocking: true,
          });
        }
      }
      for (const view of views) {
        if (
          jsonReferencesAny(
            [view.columnsJson, view.filtersJson, view.sortingJson],
            fieldKeys,
          )
        ) {
          issues.push({
            severity: 'error',
            componentId: view.id,
            componentType: 'view',
            message: `Field "${field.displayName}" is used in View "${view.name}".`,
            blocking: true,
          });
        }
      }
      for (const dependency of metadataComponents) {
        if (jsonReferencesAny(dependency.metadataJson, fieldKeys)) {
          issues.push({
            severity: 'error',
            componentId: dependency.id,
            componentType: dependency.componentType,
            message: `Field "${field.displayName}" is referenced by "${dependency.objectKey}".`,
            blocking: true,
          });
        }
      }
      issues.push(
        ...(await this.findPackageMetadataReferences(currentUser, component, [
          component.objectId,
          component.objectKey,
          field.columnKey,
        ])),
      );
    }

    if (component.componentType === 'form') {
      const form = await this.prisma.customizationForm.findFirst({
        where: {
          id: component.objectId,
          tenantId: currentUser.tenantId,
        },
      });
      if (form?.isDefault) {
        issues.push({
          severity: 'error',
          componentId: form.id,
          componentType: 'form',
          message: `Form "${form.name}" is the default Form. Select a replacement default before deletion.`,
          blocking: true,
        });
      }
      if (form) {
        issues.push(
          ...(await this.findPackageMetadataReferences(currentUser, component, [
            component.objectId,
            component.objectKey,
            form.formKey,
          ])),
        );
      }
    }

    if (component.componentType === 'view') {
      const view = await this.prisma.customizationView.findFirst({
        where: {
          id: component.objectId,
          tenantId: currentUser.tenantId,
        },
      });
      if (view?.isDefault) {
        issues.push({
          severity: 'error',
          componentId: view.id,
          componentType: 'view',
          message: `View "${view.name}" is the default View. Select a replacement default before deletion.`,
          blocking: true,
        });
      }
      if (view) {
        issues.push(
          ...(await this.findPackageMetadataReferences(currentUser, component, [
            component.objectId,
            component.objectKey,
            view.viewKey,
          ])),
        );
      }
    }

    return Array.from(
      new Map(
        issues.map((issue) => [
          `${issue.componentId}:${issue.componentType}:${issue.message}`,
          issue,
        ]),
      ).values(),
    );
  }

  private async findPackageMetadataReferences(
    currentUser: AuthenticatedUser,
    component: CustomizationSolutionComponent,
    references: readonly string[],
  ) {
    const dependencies =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: { not: component.id },
        },
        select: {
          id: true,
          componentType: true,
          objectKey: true,
          metadataJson: true,
        },
      });

    return dependencies
      .filter((dependency) =>
        jsonReferencesAny(dependency.metadataJson, references),
      )
      .map((dependency) => ({
        severity: 'error' as const,
        componentId: dependency.id,
        componentType: dependency.componentType,
        message: `"${component.objectKey}" is referenced by ${dependency.componentType} "${dependency.objectKey}".`,
        blocking: true as const,
      }));
  }

  async exportPackage(currentUser: AuthenticatedUser, packageId: string) {
    const record = await this.findPackageOrThrow(currentUser, packageId);
    if (record.solutionKey === UNASSIGNED_DRAFT_PACKAGE_KEY) {
      throw new BadRequestException(
        'Move unassigned draft customizations to a Custom Package before export.',
      );
    }
    const components = await this.getPackageComponents(currentUser, record.id);
    const moduleKeys = [
      ...new Set(
        components
          .map((component) => component.moduleKey)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    return {
      manifest: {
        packageId: record.id,
        packageKey: record.solutionKey,
        displayName: record.displayName,
        version: '1.0.0',
        publisher: this.getPackagePublisher(currentUser, record),
        exportedAt: new Date().toISOString(),
        formatVersion: '1.0',
        lifecycleState: 'draft',
      },
      modules: moduleKeys.map((moduleKey) => ({ moduleKey })),
      components,
      dependencies: components.flatMap((component) => component.dependencies),
    };
  }

  previewPackageImport(dto: PreviewCustomizationPackageImportDto) {
    const manifest = dto.manifest;
    const packageKey = manifest.packageKey;
    const version = manifest.version;
    const formatVersion = manifest.formatVersion;
    if (typeof packageKey !== 'string' || !packageKey.trim()) {
      throw new BadRequestException('Package key is required.');
    }
    if (typeof version !== 'string' || !version.trim()) {
      throw new BadRequestException('Package version is required.');
    }
    if (formatVersion !== '1.0') {
      throw new BadRequestException('Unsupported package format version.');
    }
    for (const component of dto.components) {
      if (!component || typeof component !== 'object') {
        throw new BadRequestException('Each component must be an object.');
      }
      const record = component as Record<string, unknown>;
      if (
        typeof record.id !== 'string' &&
        typeof record.objectId !== 'string' &&
        typeof record.logicalName !== 'string' &&
        typeof record.objectKey !== 'string'
      ) {
        throw new BadRequestException(
          'Each component must include an id, objectId, logicalName, or objectKey.',
        );
      }
    }

    return {
      valid: true,
      applySupported: false,
      packageName:
        typeof manifest.displayName === 'string'
          ? manifest.displayName
          : packageKey,
      version,
      publisher:
        typeof manifest.publisher === 'object' && manifest.publisher
          ? manifest.publisher
          : null,
      modulesCount: dto.modules.length,
      componentsCount: dto.components.length,
      dependenciesCount: dto.dependencies.length,
      message:
        'Package JSON is valid. Applying imported metadata is blocked until publish center and dependency validation are implemented.',
    };
  }

  async updateTable(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: UpdateCustomizationTableDto,
  ) {
    const definition = findSystemCustomizationTable(tableKey);
    const existing = await this.prisma.customizationTable.findUnique({
      where: {
        tenantId_tableKey: {
          tenantId: currentUser.tenantId,
          tableKey,
        },
      },
    });
    if (!definition && !existing) {
      throw new NotFoundException('Customization table was not found.');
    }

    return this.prisma.customizationTable.upsert({
      where: {
        tenantId_tableKey: {
          tenantId: currentUser.tenantId,
          tableKey,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        tableKey,
        systemName:
          definition?.systemName ?? existing?.systemName ?? pascalize(tableKey),
        displayName:
          dto.displayName?.trim() ??
          definition?.displayName ??
          existing?.displayName ??
          tableKey,
        pluralDisplayName:
          dto.pluralDisplayName?.trim() ??
          definition?.pluralName ??
          existing?.pluralDisplayName ??
          tableKey,
        description:
          dto.description?.trim() ??
          definition?.description ??
          existing?.description,
        icon: dto.icon?.trim() ?? definition?.icon ?? existing?.icon,
        moduleKey: definition?.moduleKey ?? existing?.moduleKey ?? 'custom',
        ownershipType:
          definition?.ownershipType ?? existing?.ownershipType ?? 'tenant',
        displayOrder:
          definition?.displayOrder ?? existing?.displayOrder ?? 9000,
        isSystem: Boolean(definition),
        isCustom: !definition,
        isCustomizable:
          dto.isCustomizable ?? definition?.isCustomizable ?? true,
        isVisibleInCustomization: definition?.isVisibleInCustomization ?? true,
        isValidForAdvancedFind: definition?.isValidForAdvancedFind ?? true,
        isValidForFormDesigner: definition?.isValidForFormDesigner ?? true,
        isValidForViewDesigner: definition?.isValidForViewDesigner ?? true,
        isActive: dto.isActive ?? true,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
      update: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.pluralDisplayName !== undefined
          ? { pluralDisplayName: dto.pluralDisplayName.trim() }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon.trim() } : {}),
        ...(dto.isCustomizable !== undefined
          ? { isCustomizable: dto.isCustomizable }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedByUserId: currentUser.userId,
      },
    });
  }

  async deleteTable(currentUser: AuthenticatedUser, tableKey: string) {
    const definition = findSystemCustomizationTable(tableKey);
    if (definition) {
      throw new BadRequestException(
        'System Modules cannot be deleted. Deactivate them instead.',
      );
    }

    const table = await this.findTenantTableOrThrow(
      currentUser.tenantId,
      tableKey,
    );
    const dependencies = await this.getTableDependencySummary(
      currentUser.tenantId,
      table,
    );
    if (dependencies.total > 0) {
      throw new BadRequestException({
        message:
          'This Module has metadata dependencies. Remove dependent Fields, Forms, Views, and package references before retirement.',
        dependencies,
      });
    }

    await this.prisma.$transaction([
      this.prisma.customizationTable.update({
        where: { id: table.id },
        data: {
          isActive: false,
          isVisibleInCustomization: false,
          updatedByUserId: currentUser.userId,
        },
      }),
      this.prisma.customizationSolutionComponent.updateMany({
        where: {
          tenantId: currentUser.tenantId,
          componentType: 'table',
          objectId: table.id,
        },
        data: {
          lifecycleState: 'retired',
          updatedByUserId: currentUser.userId,
        },
      }),
    ]);

    return {
      deleted: false,
      retired: true,
      lifecycleState: 'retired',
      message: 'The custom Module was retired. Business data was not purged.',
    };
  }

  async getTableDependencies(currentUser: AuthenticatedUser, tableKey: string) {
    const table = await this.findTenantTableOrThrow(
      currentUser.tenantId,
      tableKey,
    );
    return this.getTableDependencySummary(currentUser.tenantId, table);
  }

  async listColumns(currentUser: AuthenticatedUser, tableKey: string) {
    await this.syncDefaultSolution(currentUser);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const rows = await this.prisma.customizationColumn.findMany({
      where: {
        tenantId: currentUser.tenantId,
        tableId: table.id,
        isActive: true,
        OR: [{ isCustom: true }, { isVisibleInCustomization: true }],
      },
      orderBy: [{ sortOrder: 'asc' }, { columnKey: 'asc' }],
    });
    return rows;
  }

  async createColumn(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: CreateCustomizationColumnDto,
  ) {
    const packageRecord = await this.resolveLayerPackage(
      currentUser,
      dto.packageId,
    );
    const definition = findSystemCustomizationTable(tableKey);
    if (
      definition?.columns.some((column) => column.columnKey === dto.columnKey)
    ) {
      throw new ConflictException('A system column already uses this key.');
    }
    await this.validateLookupTarget(
      currentUser.tenantId,
      dto.lookupTargetTableKey,
    );
    this.validateValueRules(dto);

    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    await this.ensurePackageModuleMembership(
      currentUser,
      packageRecord.id,
      table,
    );

    const column = await this.prisma.customizationColumn.create({
      data: this.buildColumnData(currentUser.tenantId, table.id, dto, false),
    });
    await this.addDefaultSolutionComponent(currentUser, {
      solutionId: packageRecord.id,
      componentType: 'column',
      objectId: column.id,
      objectKey: `${table.tableKey}.${column.columnKey}`,
      tableId: table.id,
      isSystem: false,
      isCustom: true,
    });
    return column;
  }

  async updateColumn(
    currentUser: AuthenticatedUser,
    tableKey: string,
    columnKey: string,
    dto: UpdateCustomizationColumnDto,
  ) {
    const definition = findSystemCustomizationTable(tableKey);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const systemColumn = definition?.columns.find(
      (column) => column.columnKey === columnKey,
    );
    const existing = await this.prisma.customizationColumn.findUnique({
      where: {
        tenantId_tableId_columnKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          columnKey,
        },
      },
    });

    if (!systemColumn && !existing) {
      throw new NotFoundException('Customization column was not found.');
    }
    if (systemColumn?.isRequired && dto.isRequired === false) {
      throw new BadRequestException(
        'Required system columns cannot be made optional.',
      );
    }
    if (
      systemColumn &&
      dto.fieldType &&
      dto.fieldType !== systemColumn.dataType
    ) {
      throw new BadRequestException(
        'System column field types cannot be changed.',
      );
    }
    if (dto.fieldType !== undefined) {
      const lockedType =
        systemColumn?.dataType ?? existing?.dataType ?? existing?.fieldType;
      if (lockedType && dto.fieldType !== lockedType) {
        throw new BadRequestException(
          'Column data type cannot be changed after creation.',
        );
      }
    }
    await this.validateLookupTarget(
      currentUser.tenantId,
      dto.lookupTargetTableKey,
    );
    this.validateValueRules(dto);

    if (systemColumn && !existing) {
      const { component: draftLayer } =
        await this.requireExistingCustomizationLayer(
          currentUser,
          dto.packageId,
          'column',
          `${table.tableKey}.${columnKey}`,
        );
      const column = await this.prisma.customizationColumn.create({
        data: this.buildColumnData(
          currentUser.tenantId,
          table.id,
          {
            columnKey,
            displayName: dto.displayName ?? systemColumn.displayName,
            dataType: systemColumn.dataType as CustomizationFieldDataType,
            fieldType: systemColumn.dataType as CustomizationFieldDataType,
            isRequired: dto.isRequired ?? systemColumn.isRequired ?? false,
            isVisible: dto.isVisible ?? true,
            isSearchable:
              dto.isSearchable ?? systemColumn.isSearchable ?? false,
            isFilterable: dto.isFilterable ?? false,
            isReadOnly: dto.isReadOnly ?? systemColumn.isReadOnly ?? true,
            isSortable: dto.isSortable ?? false,
            maxLength: dto.maxLength,
            minValue: dto.minValue,
            maxValue: dto.maxValue,
            defaultValue: dto.defaultValue,
            lookupTargetTableKey: dto.lookupTargetTableKey,
            optionSetJson: dto.optionSetJson,
            validationJson: dto.validationJson,
            sortOrder: dto.sortOrder,
          },
          false,
          systemColumn.columnKey,
        ),
      });
      await this.prisma.customizationSolutionComponent.update({
        where: { id: draftLayer.id },
        data: {
          objectId: column.id,
          metadataJson: {
            source: 'effective-system',
            componentKey: `${table.tableKey}.${columnKey}`,
            patch: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
          },
          updatedByUserId: currentUser.userId,
        },
      });
      return column;
    }
    if (existing?.isSystem) {
      const { component: draftLayer } =
        await this.requireExistingCustomizationLayer(
          currentUser,
          dto.packageId,
          'column',
          `${table.tableKey}.${existing.columnKey}`,
        );
      await this.prisma.customizationSolutionComponent.update({
        where: { id: draftLayer.id },
        data: {
          metadataJson: {
            ...((draftLayer.metadataJson as Record<string, unknown> | null) ??
              {}),
            source: 'persisted-system',
            componentKey: `${table.tableKey}.${existing.columnKey}`,
            patch: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
          },
          updatedByUserId: currentUser.userId,
        },
      });
      return {
        ...existing,
        ...dto,
        displayName: dto.displayName?.trim() ?? existing.displayName,
        updatedByUserId: currentUser.userId,
      };
    }

    return this.prisma.customizationColumn.update({
      where: {
        tenantId_tableId_columnKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          columnKey,
        },
      },
      data: {
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.isRequired !== undefined ? { isRequired: dto.isRequired } : {}),
        ...(dto.isVisible !== undefined ? { isVisible: dto.isVisible } : {}),
        ...(dto.isSearchable !== undefined
          ? { isSearchable: dto.isSearchable }
          : {}),
        ...(dto.isFilterable !== undefined
          ? { isFilterable: dto.isFilterable }
          : {}),
        ...(dto.isSortable !== undefined ? { isSortable: dto.isSortable } : {}),
        ...(dto.isReadOnly !== undefined ? { isReadOnly: dto.isReadOnly } : {}),
        ...(dto.maxLength !== undefined ? { maxLength: dto.maxLength } : {}),
        ...(dto.minValue !== undefined ? { minValue: dto.minValue } : {}),
        ...(dto.maxValue !== undefined ? { maxValue: dto.maxValue } : {}),
        ...(dto.defaultValue !== undefined
          ? { defaultValue: dto.defaultValue }
          : {}),
        ...(dto.lookupTargetTableKey !== undefined
          ? { lookupTargetTableKey: dto.lookupTargetTableKey }
          : {}),
        ...(dto.optionSetJson !== undefined
          ? { optionSetJson: dto.optionSetJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.validationJson !== undefined
          ? { validationJson: dto.validationJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        updatedByUserId: currentUser.userId,
      },
    });
  }

  async deleteColumn(
    currentUser: AuthenticatedUser,
    tableKey: string,
    columnKey: string,
  ) {
    const definition = findSystemCustomizationTable(tableKey);
    if (definition?.columns.some((column) => column.columnKey === columnKey)) {
      throw new BadRequestException('System columns cannot be deleted.');
    }

    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );

    const existing = await this.prisma.customizationColumn.findUnique({
      where: {
        tenantId_tableId_columnKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          columnKey,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Customization column was not found.');
    }
    if (existing.isSystem) {
      throw new BadRequestException('System columns cannot be deleted.');
    }
    const dependencies = await this.getColumnDependencySummary(
      currentUser.tenantId,
      table,
      columnKey,
    );
    if (dependencies.total > 0) {
      throw new BadRequestException({
        message:
          'This column is used by active forms or views. Remove those references before deleting it.',
        dependencies,
      });
    }

    await this.prisma.$transaction([
      this.prisma.customizationSolutionComponent.deleteMany({
        where: { tenantId: currentUser.tenantId, objectId: existing.id },
      }),
      this.prisma.customizationColumn.delete({
        where: { id: existing.id },
      }),
    ]);

    return { deleted: true };
  }

  async getColumnDependencies(
    currentUser: AuthenticatedUser,
    tableKey: string,
    columnKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    return this.getColumnDependencySummary(
      currentUser.tenantId,
      table,
      columnKey,
    );
  }

  async listForms(currentUser: AuthenticatedUser, tableKey: string) {
    await this.syncDefaultSolution(currentUser);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    return this.prisma.customizationForm.findMany({
      where: { tenantId: currentUser.tenantId, tableId: table.id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: CreateCustomizationFormDto,
  ) {
    const packageRecord = await this.resolveLayerPackage(
      currentUser,
      dto.packageId,
    );
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    await this.ensurePackageModuleMembership(
      currentUser,
      packageRecord.id,
      table,
    );
    await this.validateFormLayout(currentUser, tableKey, dto.layoutJson);
    if ((dto.isDefault ?? false) && (dto.isActive ?? true)) {
      await this.assertDefaultFormContainsRequiredColumns(
        currentUser,
        tableKey,
        dto.layoutJson,
      );
    }

    if (dto.isDefault) {
      await this.prisma.customizationForm.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    const form = await this.prisma.customizationForm.create({
      data: {
        tenantId: currentUser.tenantId,
        tableId: table.id,
        formKey: dto.formKey,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type ?? CustomizationFormType.main,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        layoutJson: dto.layoutJson as Prisma.InputJsonValue,
        isSystem: false,
        isCustom: true,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
    });
    await this.addDefaultSolutionComponent(currentUser, {
      solutionId: packageRecord.id,
      componentType: 'form',
      objectId: form.id,
      objectKey: `${table.tableKey}.${form.formKey}`,
      tableId: table.id,
      isSystem: false,
      isCustom: true,
    });
    return form;
  }

  async updateForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    formKey: string,
    dto: UpdateCustomizationFormDto,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const existing = await this.prisma.customizationForm.findUnique({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
    });
    if (!existing) {
      const { component: draftLayer } =
        await this.requireExistingCustomizationLayer(
          currentUser,
          dto.packageId,
          'form',
          `${table.tableKey}.${formKey}`,
        );
      const layoutJson = dto.layoutJson ?? { tabs: [] };
      await this.validateFormLayout(currentUser, tableKey, layoutJson);
      const form = await this.prisma.customizationForm.create({
        data: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
          name: dto.name?.trim() || formKey,
          description: dto.description?.trim(),
          type: dto.type ?? CustomizationFormType.main,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
          layoutJson: layoutJson as Prisma.InputJsonValue,
          isSystem: false,
          isCustom: true,
          createdByUserId: currentUser.userId,
          updatedByUserId: currentUser.userId,
        },
      });
      await this.prisma.customizationSolutionComponent.update({
        where: { id: draftLayer.id },
        data: {
          objectId: form.id,
          metadataJson: {
            ...((draftLayer.metadataJson as Record<string, unknown> | null) ??
              {}),
            source: 'effective-system',
            componentKey: `${table.tableKey}.${formKey}`,
          },
          updatedByUserId: currentUser.userId,
        },
      });
      return form;
    }
    if (existing.isSystem) {
      throw new BadRequestException(
        'System forms must be customized through a draft layer in a Custom Package.',
      );
    }
    if (dto.layoutJson !== undefined) {
      await this.validateFormLayout(currentUser, tableKey, dto.layoutJson);
    }
    const nextLayout = dto.layoutJson ?? existing.layoutJson;
    const nextIsDefault = dto.isDefault ?? existing.isDefault;
    const nextIsActive = dto.isActive ?? existing.isActive;
    if (nextIsDefault && nextIsActive) {
      await this.assertDefaultFormContainsRequiredColumns(
        currentUser,
        tableKey,
        nextLayout,
      );
    }

    if (dto.isDefault) {
      await this.prisma.customizationForm.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.customizationForm.update({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.layoutJson !== undefined
          ? { layoutJson: dto.layoutJson as Prisma.InputJsonValue }
          : {}),
        updatedByUserId: currentUser.userId,
      },
    });
  }

  async deleteForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    formKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const existing = await this.prisma.customizationForm.findUnique({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Customization form was not found.');
    }
    if (existing.isSystem) {
      throw new BadRequestException('System forms cannot be deleted.');
    }
    if (existing.isDefault) {
      const activeAlternatives = await this.prisma.customizationForm.count({
        where: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          isActive: true,
          formKey: { not: formKey },
        },
      });
      if (activeAlternatives === 0) {
        throw new BadRequestException(
          'Cannot delete the last active default/system form for this table.',
        );
      }
    }
    await this.prisma.$transaction([
      this.prisma.customizationSolutionComponent.deleteMany({
        where: { tenantId: currentUser.tenantId, objectId: existing.id },
      }),
      this.prisma.customizationForm.delete({
        where: { id: existing.id },
      }),
    ]);

    return { deleted: true };
  }

  async setDefaultForm(
    currentUser: AuthenticatedUser,
    tableKey: string,
    formKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const form = await this.prisma.customizationForm.findUnique({
      where: {
        tenantId_tableId_formKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey,
        },
      },
    });
    if (!form) {
      throw new NotFoundException('Customization form was not found.');
    }
    await this.assertDefaultFormContainsRequiredColumns(
      currentUser,
      tableKey,
      form.layoutJson,
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.customizationForm.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
      return tx.customizationForm.update({
        where: {
          tenantId_tableId_formKey: {
            tenantId: currentUser.tenantId,
            tableId: table.id,
            formKey,
          },
        },
        data: { isDefault: true, isActive: true },
      });
    });
  }

  async listTableViews(currentUser: AuthenticatedUser, tableKey: string) {
    await this.syncDefaultSolution(currentUser);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    return this.prisma.customizationView.findMany({
      where: { tenantId: currentUser.tenantId, tableId: table.id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    dto: CreateCustomizationViewDto,
  ) {
    const packageRecord = await this.resolveLayerPackage(
      currentUser,
      dto.packageId,
    );
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    await this.ensurePackageModuleMembership(
      currentUser,
      packageRecord.id,
      table,
    );
    await this.validateViewMetadata(currentUser, tableKey, {
      columnsJson: dto.columnsJson,
      filtersJson: dto.filtersJson,
      sortingJson: dto.sortingJson,
    });
    if ((dto.isDefault ?? false) && (dto.isHidden ?? false)) {
      throw new BadRequestException('Default views cannot be hidden.');
    }

    if (dto.isDefault) {
      await this.prisma.customizationView.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    const view = await this.prisma.customizationView.create({
      data: {
        tenantId: currentUser.tenantId,
        tableId: table.id,
        viewKey: dto.viewKey,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        type: dto.type ?? 'custom',
        isDefault: dto.isDefault ?? false,
        isHidden: dto.isHidden ?? false,
        isSystem: (dto.type ?? 'custom') === 'system',
        isCustom: (dto.type ?? 'custom') !== 'system',
        columnsJson: dto.columnsJson as Prisma.InputJsonValue,
        filtersJson:
          dto.filtersJson !== undefined
            ? (dto.filtersJson as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        sortingJson:
          dto.sortingJson !== undefined
            ? (dto.sortingJson as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        visibilityScope: dto.visibilityScope ?? 'tenant',
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
    });
    await this.addDefaultSolutionComponent(currentUser, {
      solutionId: packageRecord.id,
      componentType: 'view',
      objectId: view.id,
      objectKey: `${table.tableKey}.${view.viewKey}`,
      tableId: table.id,
      isSystem: false,
      isCustom: true,
    });
    return view;
  }

  async updateTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
    dto: UpdateCustomizationViewDto,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const existing = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!existing) {
      const { component: draftLayer } =
        await this.requireExistingCustomizationLayer(
          currentUser,
          dto.packageId,
          'view',
          `${table.tableKey}.${viewKey}`,
        );
      await this.validateViewMetadata(currentUser, tableKey, {
        columnsJson: dto.columnsJson ?? {},
        filtersJson: dto.filtersJson,
        sortingJson: dto.sortingJson,
      });
      const view = await this.prisma.customizationView.create({
        data: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
          name: dto.name?.trim() || viewKey,
          description: dto.description?.trim(),
          type: 'custom',
          isDefault: dto.isDefault ?? false,
          isHidden: dto.isHidden ?? false,
          isSystem: false,
          isCustom: true,
          columnsJson: (dto.columnsJson ?? {}) as Prisma.InputJsonValue,
          filtersJson:
            dto.filtersJson !== undefined
              ? (dto.filtersJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          sortingJson:
            dto.sortingJson !== undefined
              ? (dto.sortingJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          visibilityScope: dto.visibilityScope ?? 'tenant',
          createdByUserId: currentUser.userId,
          updatedByUserId: currentUser.userId,
        },
      });
      await this.prisma.customizationSolutionComponent.update({
        where: { id: draftLayer.id },
        data: {
          objectId: view.id,
          metadataJson: {
            ...((draftLayer.metadataJson as Record<string, unknown> | null) ??
              {}),
            source: 'effective-system',
            componentKey: `${table.tableKey}.${viewKey}`,
          },
          updatedByUserId: currentUser.userId,
        },
      });
      return view;
    }
    if (existing.isSystem || existing.type === 'system') {
      throw new BadRequestException(
        'System views must be customized through a draft layer in a Custom Package.',
      );
    }

    await this.validateViewMetadata(currentUser, tableKey, {
      columnsJson: dto.columnsJson ?? existing.columnsJson,
      filtersJson: dto.filtersJson ?? existing.filtersJson ?? undefined,
      sortingJson: dto.sortingJson ?? existing.sortingJson ?? undefined,
    });
    const nextIsDefault = dto.isDefault ?? existing.isDefault;
    const nextIsHidden = dto.isHidden ?? existing.isHidden;
    if (nextIsDefault && nextIsHidden) {
      throw new BadRequestException('Default views cannot be hidden.');
    }

    if (dto.isDefault) {
      await this.prisma.customizationView.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
    }

    return this.prisma.customizationView.update({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.type !== undefined
          ? { isSystem: dto.type === 'system', isCustom: dto.type !== 'system' }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.isHidden !== undefined ? { isHidden: dto.isHidden } : {}),
        ...(dto.columnsJson !== undefined
          ? { columnsJson: dto.columnsJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.filtersJson !== undefined
          ? { filtersJson: dto.filtersJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.sortingJson !== undefined
          ? { sortingJson: dto.sortingJson as Prisma.InputJsonValue }
          : {}),
        ...(dto.visibilityScope !== undefined
          ? { visibilityScope: dto.visibilityScope }
          : {}),
        updatedByUserId: currentUser.userId,
      },
    });
  }

  async deleteTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const existing = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Customization view was not found.');
    }
    if (existing.type === 'system' || existing.isSystem) {
      throw new BadRequestException('System views cannot be deleted.');
    }
    if (existing.isDefault && !existing.isHidden) {
      const visibleAlternatives = await this.prisma.customizationView.count({
        where: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          isHidden: false,
          viewKey: { not: viewKey },
        },
      });
      if (visibleAlternatives === 0) {
        throw new BadRequestException(
          'Cannot delete the last visible default view for this table.',
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.customizationSolutionComponent.deleteMany({
        where: { tenantId: currentUser.tenantId, objectId: existing.id },
      }),
      this.prisma.customizationView.delete({
        where: {
          tenantId_tableId_viewKey: {
            tenantId: currentUser.tenantId,
            tableId: table.id,
            viewKey,
          },
        },
      }),
    ]);

    return { deleted: true };
  }

  async setTableViewHidden(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
    isHidden: boolean,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const view = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!view) {
      throw new NotFoundException('Customization view was not found.');
    }
    if (isHidden && view.isDefault) {
      throw new BadRequestException('Default views cannot be hidden.');
    }

    return this.prisma.customizationView.update({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
      data: { isHidden },
    });
  }

  async setDefaultTableView(
    currentUser: AuthenticatedUser,
    tableKey: string,
    viewKey: string,
  ) {
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      tableKey,
    );
    const view = await this.prisma.customizationView.findUnique({
      where: {
        tenantId_tableId_viewKey: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey,
        },
      },
    });
    if (!view) {
      throw new NotFoundException('Customization view was not found.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customizationView.updateMany({
        where: { tenantId: currentUser.tenantId, tableId: table.id },
        data: { isDefault: false },
      });
      return tx.customizationView.update({
        where: {
          tenantId_tableId_viewKey: {
            tenantId: currentUser.tenantId,
            tableId: table.id,
            viewKey,
          },
        },
        data: { isDefault: true, isHidden: false },
      });
    });
  }

  async listViews(currentUser: AuthenticatedUser, moduleKey?: string) {
    await this.syncDefaultSolution(currentUser);
    const tableKeys = moduleKey
      ? SYSTEM_CUSTOMIZATION_TABLES.filter(
          (table) => table.moduleKey === moduleKey,
        ).map((table) => table.tableKey)
      : null;

    const tables = await this.prisma.customizationTable.findMany({
      where: {
        tenantId: currentUser.tenantId,
        ...(tableKeys ? { tableKey: { in: tableKeys } } : {}),
      },
      select: { id: true },
    });

    return this.prisma.customizationView.findMany({
      where: {
        tenantId: currentUser.tenantId,
        tableId: { in: tables.map((table) => table.id) },
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createView(currentUser: AuthenticatedUser, dto: CreateModuleViewDto) {
    const definition = this.getFirstTableForModule(dto.moduleKey);
    const table = await this.ensureCustomizationTable(
      currentUser.tenantId,
      definition.tableKey,
    );
    const viewKey = slugKey(dto.slug ?? dto.name);
    const configJson = dto.configJson ?? {};
    const columnsJson =
      Array.isArray(configJson.columns) ||
      typeof configJson.columns === 'object'
        ? configJson.columns
        : [];
    await this.validateViewMetadata(currentUser, definition.tableKey, {
      columnsJson,
      filtersJson: configJson.filters,
      sortingJson: configJson.sorting,
    });

    const view = await this.prisma.customizationView.create({
      data: {
        tenantId: currentUser.tenantId,
        tableId: table.id,
        viewKey,
        name: dto.name.trim(),
        type: dto.type ?? 'custom',
        isDefault: dto.isDefault ?? false,
        isHidden: dto.isActive === false,
        columnsJson: columnsJson as Prisma.InputJsonValue,
        filtersJson:
          configJson.filters !== undefined
            ? (configJson.filters as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        sortingJson:
          configJson.sorting !== undefined
            ? (configJson.sorting as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        visibilityScope: dto.visibilityScope ?? 'tenant',
        createdByUserId: currentUser.userId,
      },
    });
    await this.addDefaultSolutionComponent(currentUser, {
      componentType: 'view',
      objectId: view.id,
      objectKey: `${table.tableKey}.${view.viewKey}`,
      tableId: table.id,
      isSystem: false,
      isCustom: true,
    });
    return view;
  }

  async updateView(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateModuleViewDto,
  ) {
    const existing = await this.prisma.customizationView.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });
    if (!existing) {
      throw new NotFoundException('Customization view was not found.');
    }

    const configJson = dto.configJson ?? {};
    const table = await this.prisma.customizationTable.findFirst({
      where: { tenantId: currentUser.tenantId, id: existing.tableId },
    });
    if (!table) {
      throw new NotFoundException('Customization table was not found.');
    }
    if (dto.configJson !== undefined) {
      await this.validateViewMetadata(currentUser, table.tableKey, {
        columnsJson:
          configJson.columns !== undefined
            ? configJson.columns
            : existing.columnsJson,
        filtersJson:
          configJson.filters !== undefined
            ? configJson.filters
            : existing.filtersJson,
        sortingJson:
          configJson.sorting !== undefined
            ? configJson.sorting
            : existing.sortingJson,
      });
    }
    const viewUpdateData: Prisma.CustomizationViewUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.slug !== undefined ? { viewKey: slugKey(dto.slug) } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto.isActive !== undefined ? { isHidden: !dto.isActive } : {}),
      ...(dto.configJson !== undefined
        ? {
            columnsJson:
              configJson.columns !== undefined
                ? (configJson.columns as Prisma.InputJsonValue)
                : (existing.columnsJson as Prisma.InputJsonValue),
            filtersJson:
              configJson.filters !== undefined
                ? (configJson.filters as Prisma.InputJsonValue)
                : existing.filtersJson === null
                  ? Prisma.JsonNull
                  : existing.filtersJson,
            sortingJson:
              configJson.sorting !== undefined
                ? (configJson.sorting as Prisma.InputJsonValue)
                : existing.sortingJson === null
                  ? Prisma.JsonNull
                  : existing.sortingJson,
          }
        : {}),
      ...(dto.visibilityScope !== undefined
        ? { visibilityScope: dto.visibilityScope }
        : {}),
    };

    return this.prisma.customizationView.update({
      where: { id },
      data: viewUpdateData,
    });
  }

  async deleteView(currentUser: AuthenticatedUser, id: string) {
    const existing = await this.prisma.customizationView.findFirst({
      where: { id, tenantId: currentUser.tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Customization view was not found.');
    }
    if (existing.type === 'system') {
      throw new BadRequestException('System views cannot be deleted.');
    }

    await this.prisma.$transaction([
      this.prisma.customizationSolutionComponent.deleteMany({
        where: { tenantId: currentUser.tenantId, objectId: existing.id },
      }),
      this.prisma.customizationView.delete({ where: { id } }),
    ]);

    return { success: true };
  }

  /**
   * Publishes the default views and forms for a tenant that has none.
   *
   * A tenant with no published snapshot falls back to views hardcoded in the
   * web app, so its customization metadata is never actually used. Publishing
   * once at provisioning makes the defaults real for every tenant, and a
   * customer's own views then layer on top through their custom package.
   */
  async publishTenantDefaults(tenantId: string, actorUserId: string | null) {
    const existing = await this.prisma.customizationPublishSnapshot.findFirst({
      where: { tenantId, status: 'published' },
      select: { id: true },
    });

    if (existing) {
      return { published: false, reason: 'already-published' as const };
    }

    const draft = await this.buildPublishDraft(tenantId);
    const snapshot = await this.prisma.customizationPublishSnapshot.create({
      data: {
        tenantId,
        version: 1,
        status: 'published',
        publishedByUserId: actorUserId,
        publishedAt: new Date(),
        snapshotJson: toJsonValue(draft),
      },
    });

    return {
      published: true,
      snapshotId: snapshot.id,
      views: draft.views.length,
      forms: draft.forms.length,
    };
  }

  async publish(currentUser: AuthenticatedUser) {
    const draft = await this.buildPublishDraft(currentUser.tenantId);
    const validationErrors = this.validatePublishDraft(draft);

    if (validationErrors.length > 0) {
      throw new BadRequestException({
        message: 'Customization publish validation failed.',
        errors: validationErrors,
      });
    }

    const latest = await this.prisma.customizationPublishSnapshot.findFirst({
      where: { tenantId: currentUser.tenantId },
      orderBy: { version: 'desc' },
    });
    const publishedAt = new Date();
    const snapshot = await this.prisma.customizationPublishSnapshot.create({
      data: {
        tenantId: currentUser.tenantId,
        version: (latest?.version ?? 0) + 1,
        status: 'published',
        publishedByUserId: currentUser.userId,
        publishedAt,
        snapshotJson: toJsonValue(draft),
      },
    });

    return {
      id: snapshot.id,
      version: snapshot.version,
      publishedAt,
      tables: draft.tables.length,
      columns: draft.columns.length,
      views: draft.views.length,
      forms: draft.forms.length,
    };
  }

  private async buildPublishDraft(tenantId: string) {
    await Promise.all(
      SYSTEM_CUSTOMIZATION_TABLES.map((definition) =>
        this.ensureCustomizationTable(tenantId, definition.tableKey),
      ),
    );

    const [tables, columns, views, forms] = await Promise.all([
      this.prisma.customizationTable.findMany({
        where: {
          tenantId,
          OR: [{ isCustom: true }, { isVisibleInCustomization: true }],
        },
        orderBy: { tableKey: 'asc' },
      }),
      this.prisma.customizationColumn.findMany({
        where: {
          tenantId,
          OR: [{ isCustom: true }, { isVisibleInCustomization: true }],
        },
        orderBy: [
          { tableId: 'asc' },
          { sortOrder: 'asc' },
          { columnKey: 'asc' },
        ],
      }),
      this.prisma.customizationView.findMany({
        where: { tenantId },
        orderBy: [{ tableId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.customizationForm.findMany({
        where: { tenantId },
        orderBy: [{ tableId: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
      }),
    ]);

    return { tables, columns, views, forms };
  }

  private validatePublishDraft(draft: PublishDraft) {
    const errors: PublishValidationError[] = [];
    const tableById = new Map(draft.tables.map((table) => [table.id, table]));
    const tableByKey = new Map(
      draft.tables.map((table) => [table.tableKey, table]),
    );
    const columnsByTableId = groupBy(draft.columns, (column) => column.tableId);
    const viewsByTableId = groupBy(draft.views, (view) => view.tableId);
    const formsByTableId = groupBy(draft.forms, (form) => form.tableId);

    for (const table of draft.tables) {
      const definition = findSystemCustomizationTable(table.tableKey);
      const effectiveColumns = buildEffectivePublishColumns(
        definition ?? null,
        columnsByTableId.get(table.id) ?? [],
      );
      const validColumnKeys = new Set(
        effectiveColumns.map((column) => column.columnKey),
      );
      const visibleColumnKeys = new Set(
        effectiveColumns
          .filter((column) => column.isVisible !== false)
          .map((column) => column.columnKey),
      );

      for (const column of effectiveColumns) {
        const isLookup =
          column.fieldType === 'lookup' || column.dataType === 'lookup';
        if (!isLookup) {
          continue;
        }
        if (!column.lookupTargetTableKey && !column.isSystem) {
          errors.push({
            scope: 'column',
            tableKey: table.tableKey,
            entityKey: column.columnKey,
            message: 'Custom lookup columns must have a lookup target table.',
          });
          continue;
        }
        if (
          column.lookupTargetTableKey &&
          !findSystemCustomizationTable(column.lookupTargetTableKey) &&
          !tableByKey.has(column.lookupTargetTableKey)
        ) {
          errors.push({
            scope: 'column',
            tableKey: table.tableKey,
            entityKey: column.columnKey,
            message: `Lookup target "${column.lookupTargetTableKey}" is not a customizable table.`,
          });
        }
      }

      const tableViews = viewsByTableId.get(table.id) ?? [];
      if (
        tableViews.length > 0 &&
        !tableViews.some((view) => view.isDefault && !view.isHidden)
      ) {
        errors.push({
          scope: 'view',
          tableKey: table.tableKey,
          message:
            'At least one visible default view is required before publishing.',
        });
      }

      for (const view of tableViews) {
        if (!tableById.has(view.tableId)) {
          errors.push({
            scope: 'view',
            tableKey: table.tableKey,
            entityKey: view.viewKey,
            message: 'View is linked to an unknown customization table.',
          });
          continue;
        }
        if (view.isDefault && view.isHidden) {
          errors.push({
            scope: 'view',
            tableKey: table.tableKey,
            entityKey: view.viewKey,
            message: 'Default views cannot be hidden.',
          });
        }
        pushInvalidColumnReferenceErrors(
          errors,
          'view',
          table.tableKey,
          view.viewKey,
          'View columns',
          extractColumnRefs(view.columnsJson, true),
          visibleColumnKeys,
        );
        pushInvalidColumnReferenceErrors(
          errors,
          'view',
          table.tableKey,
          view.viewKey,
          'View filters',
          extractColumnRefs(view.filtersJson),
          visibleColumnKeys,
        );
        pushInvalidColumnReferenceErrors(
          errors,
          'view',
          table.tableKey,
          view.viewKey,
          'View sorting',
          extractColumnRefs(view.sortingJson),
          visibleColumnKeys,
        );
      }

      const tableForms = formsByTableId.get(table.id) ?? [];
      if (
        tableForms.length > 0 &&
        !tableForms.some((form) => form.isDefault && form.isActive)
      ) {
        errors.push({
          scope: 'form',
          tableKey: table.tableKey,
          message:
            'At least one active default form is required before publishing.',
        });
      }

      const requiredColumnKeys = effectiveColumns
        .filter((column) => column.isRequired)
        .map((column) => column.columnKey);
      for (const form of tableForms) {
        if (!tableById.has(form.tableId)) {
          errors.push({
            scope: 'form',
            tableKey: table.tableKey,
            entityKey: form.formKey,
            message: 'Form is linked to an unknown customization table.',
          });
          continue;
        }
        pushInvalidColumnReferenceErrors(
          errors,
          'form',
          table.tableKey,
          form.formKey,
          'Form layout',
          extractColumnRefs(form.layoutJson, true),
          validColumnKeys,
        );

        if (form.isDefault && form.isActive) {
          const visibleFormFields = extractVisibleFormFieldRefs(
            form.layoutJson,
          );
          const missingRequired = requiredColumnKeys.filter(
            (columnKey) => !visibleFormFields.has(columnKey),
          );
          if (missingRequired.length > 0) {
            errors.push({
              scope: 'form',
              tableKey: table.tableKey,
              entityKey: form.formKey,
              message: `Default form is missing required fields: ${missingRequired.join(', ')}.`,
            });
          }
        }
      }
    }

    return errors;
  }

  private async buildTableResponses(
    currentUser: AuthenticatedUser,
    tableKeys?: string[],
  ) {
    const rows = await this.prisma.customizationTable.findMany({
      where: {
        tenantId: currentUser.tenantId,
        ...(tableKeys ? { tableKey: { in: tableKeys } } : {}),
        ...(tableKeys
          ? {}
          : {
              OR: [
                { isCustom: true },
                { isVisibleInCustomization: true, isActive: true },
              ],
            }),
      },
      orderBy: [
        { displayOrder: 'asc' },
        { displayName: 'asc' },
        { tableKey: 'asc' },
      ],
    });
    const tableIds = rows.map((row) => row.id);
    const effectiveComponents =
      await this.prisma.customizationSolutionComponent.findMany({
        where: {
          tenantId: currentUser.tenantId,
          tableId: { in: tableIds },
          lifecycleState: 'published',
        },
        select: {
          componentType: true,
          objectId: true,
          tableId: true,
          isSystem: true,
          isCustom: true,
          lifecycleState: true,
          solution: {
            select: {
              displayName: true,
              isDefault: true,
              solutionKey: true,
            },
          },
        },
      });
    const countsByTableId = new Map<
      string,
      {
        actionBars: Set<string>;
        choiceLists: Set<string>;
        fields: Set<string>;
        forms: Set<string>;
        relationships: Set<string>;
        views: Set<string>;
      }
    >();
    for (const tableId of tableIds) {
      countsByTableId.set(tableId, {
        actionBars: new Set(),
        choiceLists: new Set(),
        fields: new Set(),
        forms: new Set(),
        relationships: new Set(),
        views: new Set(),
      });
    }
    for (const component of effectiveComponents) {
      if (!component.tableId) continue;
      const counts = countsByTableId.get(component.tableId);
      if (!counts) continue;
      if (component.componentType === 'column')
        counts.fields.add(component.objectId);
      if (component.componentType === 'form')
        counts.forms.add(component.objectId);
      if (component.componentType === 'view')
        counts.views.add(component.objectId);
      if (component.componentType === 'optionSet') {
        counts.choiceLists.add(component.objectId);
      }
      if (component.componentType === 'lookup') {
        counts.relationships.add(component.objectId);
      }
      if (component.componentType === 'actionBar') {
        counts.actionBars.add(component.objectId);
      }
    }

    return rows
      .map((row) =>
        this.toTableResponse(null, row, countsByTableId.get(row.id)),
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private toPackageResponse(
    currentUser: AuthenticatedUser,
    record: CustomizationSolution,
    componentSummary: PackageComponentSummary,
    version = '1.0.0',
    publisherName?: string,
  ) {
    const publisher = this.getPackagePublisher(
      currentUser,
      record,
      publisherName,
    );
    const type = record.isDefault
      ? 'default'
      : record.isManaged
        ? 'managed'
        : 'custom';
    const state = this.packageState(record, componentSummary);

    return {
      id: record.id,
      packageKey: record.solutionKey,
      displayName: record.displayName.replace('Solution', 'Package'),
      description: record.description?.replace('solution', 'package') ?? null,
      publisher,
      publisherId: publisher.publisherId,
      publisherName: publisher.displayName,
      prefix: publisher.prefix,
      version,
      type,
      state,
      isManaged: record.isManaged,
      isDefault: record.isDefault,
      isReadOnly: record.isDefault || record.isSystem,
      canEdit: !record.isDefault && !record.isSystem,
      canPublish: !record.isDefault && !record.isManaged,
      canDelete:
        !record.isDefault &&
        !record.isSystem &&
        !record.isManaged &&
        componentSummary.published === 0,
      deleteDisabledReason:
        record.isDefault || record.isSystem
          ? 'Default/System Package cannot be deleted.'
          : record.isManaged
            ? 'Managed packages cannot be deleted.'
            : componentSummary.published > 0
              ? 'Package cannot be deleted while published package components exist. Retire or replace the published metadata first.'
              : null,
      componentsCount: componentSummary.total,
      draftComponentsCount: componentSummary.draft,
      publishedComponentsCount: componentSummary.published,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
    };
  }

  private getPackagePublisher(
    currentUser: AuthenticatedUser,
    record: CustomizationSolution,
    publisherName?: string,
  ) {
    if (record.isDefault || record.solutionKey === 'default') {
      return {
        publisherId: 'system:dijipeople',
        displayName: 'DijiPeople',
        prefix: '',
        isDefault: true,
        isPrefixLocked: true,
      };
    }

    const displayName =
      publisherName?.trim() || currentUser.tenantName?.trim() || 'Custom';
    const prefix =
      extractPackagePrefix(record.solutionKey) || publisherPrefix(displayName);

    return {
      publisherId: `tenant:${currentUser.tenantId}`,
      displayName,
      prefix,
      isDefault: false,
      isPrefixLocked: true,
    };
  }

  private packageState(
    record: CustomizationSolution,
    componentSummary: PackageComponentSummary,
  ) {
    if (!record.isActive) return 'archived';
    if (record.isDefault) return 'published';
    if (componentSummary.total > 0 && componentSummary.draft === 0) {
      return 'published';
    }
    return 'draft';
  }

  private summarizePackageComponents(
    components: readonly { lifecycleState?: string | null }[],
  ): PackageComponentSummary {
    const draft = components.filter(
      (component) => component.lifecycleState === 'draft',
    ).length;
    const published = components.filter(
      (component) => component.lifecycleState === 'published',
    ).length;

    return {
      draft,
      published,
      total: components.length,
    };
  }

  private async getPackageStateSummaries(
    currentUser: AuthenticatedUser,
    packageIds: readonly string[],
  ) {
    if (!packageIds.length) return [];
    const packages = await this.prisma.customizationSolution.findMany({
      where: {
        tenantId: currentUser.tenantId,
        id: { in: [...packageIds] },
      },
      include: { components: { select: { lifecycleState: true } } },
    });

    return packages.map((record) => {
      const summary = this.summarizePackageComponents(record.components);
      return {
        packageId: record.id,
        packageKey: record.solutionKey,
        packageName: record.displayName,
        beforeState: 'draft',
        afterState: this.packageState(record, summary),
        draftComponentsCount: summary.draft,
        publishedComponentsCount: summary.published,
      };
    });
  }

  private async uniquePublisherPrefix(
    currentUser: AuthenticatedUser,
    publisherName: string,
  ) {
    const basePrefix = publisherPrefix(publisherName);
    const packages = await this.prisma.customizationSolution.findMany({
      where: {
        tenantId: currentUser.tenantId,
        isDefault: false,
      },
      select: { solutionKey: true },
    });
    const existingPrefixes = new Set(
      packages
        .map((record) => extractPackagePrefix(record.solutionKey))
        .filter(Boolean),
    );

    if (!existingPrefixes.has(basePrefix)) return basePrefix;

    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${basePrefix.replace(/_$/g, '')}${index}_`;
      if (!existingPrefixes.has(candidate)) return candidate;
    }

    throw new ConflictException(
      'Unable to generate a unique publisher prefix.',
    );
  }

  private async uniquePackageKey(
    currentUser: AuthenticatedUser,
    basePackageKey: string,
  ) {
    const normalizedBase = basePackageKey || 'custom_package';
    let candidate = normalizedBase;
    for (let index = 2; index < 1000; index += 1) {
      const existing = await this.prisma.customizationSolution.findUnique({
        where: {
          tenantId_solutionKey: {
            tenantId: currentUser.tenantId,
            solutionKey: candidate,
          },
        },
      });
      if (!existing) return candidate;
      candidate = `${normalizedBase}${index}`;
    }

    throw new ConflictException('Unable to generate a unique package key.');
  }

  private async findPackageOrThrow(
    currentUser: AuthenticatedUser,
    packageId: string,
  ) {
    const record = await this.prisma.customizationSolution.findFirst({
      where: {
        tenantId: currentUser.tenantId,
        OR: [{ id: packageId }, { solutionKey: packageId }],
      },
    });
    if (!record) {
      throw new NotFoundException('Customization package was not found.');
    }
    return record;
  }

  private async resolveLayerPackage(
    currentUser: AuthenticatedUser,
    packageId?: string,
  ) {
    const record = packageId
      ? await this.findPackageOrThrow(currentUser, packageId)
      : await this.getOrCreateUnassignedDraftPackage(currentUser);
    if (record.isDefault || record.isSystem) {
      throw new BadRequestException(
        'Default Package cannot contain customization layers.',
      );
    }
    return record;
  }

  private async requireExistingCustomizationLayer(
    currentUser: AuthenticatedUser,
    packageId: string | undefined,
    componentType: CustomizationSolutionComponentType,
    objectKey: string,
  ) {
    if (!packageId) {
      throw new BadRequestException(
        'Use Add Existing to add this component to a Custom Package before editing it.',
      );
    }
    const packageRecord = await this.resolveLayerPackage(
      currentUser,
      packageId,
    );
    const component =
      await this.prisma.customizationSolutionComponent.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          solutionId: packageRecord.id,
          componentType,
          objectKey,
          layerAction: 'modify',
          lifecycleState: 'draft',
        },
      });
    if (!component) {
      throw new BadRequestException(
        'Use Add Existing to add this component to the selected Custom Package before editing it.',
      );
    }
    return { component, packageRecord };
  }

  private async getOrCreateUnassignedDraftPackage(
    currentUser: AuthenticatedUser,
  ) {
    return this.prisma.customizationSolution.upsert({
      where: {
        tenantId_solutionKey: {
          tenantId: currentUser.tenantId,
          solutionKey: UNASSIGNED_DRAFT_PACKAGE_KEY,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        solutionKey: UNASSIGNED_DRAFT_PACKAGE_KEY,
        displayName: UNASSIGNED_DRAFT_PACKAGE_NAME,
        description:
          'Internal holding area for draft customizations not assigned to an exportable Custom Package.',
        scope: 'tenant',
        isDefault: false,
        isSystem: false,
        isManaged: false,
        isActive: true,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
      update: {
        displayName: UNASSIGNED_DRAFT_PACKAGE_NAME,
        isDefault: false,
        isSystem: false,
        isActive: true,
        updatedByUserId: currentUser.userId,
      },
    });
  }

  private async findComponentBase(
    currentUser: AuthenticatedUser,
    componentType: CustomizationSolutionComponentType,
    tableId: string,
    componentKey: string,
  ) {
    const componentKeyParts = componentKey.split('.');
    const localKey = componentKey.includes('.')
      ? componentKeyParts[componentKeyParts.length - 1]
      : componentKey;
    if (componentType === 'form') {
      const form = await this.prisma.customizationForm.findUnique({
        where: {
          tenantId_tableId_formKey: {
            tenantId: currentUser.tenantId,
            tableId,
            formKey: localKey,
          },
        },
      });
      return {
        objectId: form?.id ?? `${tableId}:${localKey}`,
        baseComponentId: form?.id ?? `${tableId}:${localKey}`,
        isSystem: form?.isSystem ?? true,
      };
    }
    if (componentType === 'view') {
      const view = await this.prisma.customizationView.findUnique({
        where: {
          tenantId_tableId_viewKey: {
            tenantId: currentUser.tenantId,
            tableId,
            viewKey: localKey,
          },
        },
      });
      return {
        objectId: view?.id ?? `${tableId}:${localKey}`,
        baseComponentId: view?.id ?? `${tableId}:${localKey}`,
        isSystem: view ? (view.isSystem ?? view.type === 'system') : true,
      };
    }
    if (componentType === 'column') {
      const column = await this.prisma.customizationColumn.findUnique({
        where: {
          tenantId_tableId_columnKey: {
            tenantId: currentUser.tenantId,
            tableId,
            columnKey: localKey,
          },
        },
      });
      return {
        objectId: column?.id ?? `${tableId}:${localKey}`,
        baseComponentId: column?.id ?? `${tableId}:${localKey}`,
        isSystem: column?.isSystem ?? true,
      };
    }
    return {
      objectId: `${tableId}:${localKey}`,
      baseComponentId: `${tableId}:${localKey}`,
      isSystem: false,
    };
  }

  private async getPackageComponents(
    currentUser: AuthenticatedUser,
    packageId: string,
  ) {
    const components =
      await this.prisma.customizationSolutionComponent.findMany({
        where: { tenantId: currentUser.tenantId, solutionId: packageId },
        orderBy: [
          { componentType: 'asc' },
          { objectKey: 'asc' },
          { updatedAt: 'desc' },
        ],
      });
    const objectIds = components.map((component) => component.objectId);
    const tableIds = [
      ...new Set([
        ...components
          .map((component) => component.tableId)
          .filter((value): value is string => Boolean(value)),
        ...components
          .filter((component) => component.componentType === 'table')
          .map((component) => component.objectId),
      ]),
    ];
    const [tables, columns, forms, views] = await Promise.all([
      this.prisma.customizationTable.findMany({
        where: {
          tenantId: currentUser.tenantId,
          id: { in: [...new Set([...objectIds, ...tableIds])] },
        },
      }),
      this.prisma.customizationColumn.findMany({
        where: { tenantId: currentUser.tenantId, id: { in: objectIds } },
      }),
      this.prisma.customizationForm.findMany({
        where: { tenantId: currentUser.tenantId, id: { in: objectIds } },
      }),
      this.prisma.customizationView.findMany({
        where: { tenantId: currentUser.tenantId, id: { in: objectIds } },
      }),
    ]);
    const tableById = new Map(tables.map((table) => [table.id, table]));
    const columnById = new Map(columns.map((column) => [column.id, column]));
    const formById = new Map(forms.map((form) => [form.id, form]));
    const viewById = new Map(views.map((view) => [view.id, view]));

    return components.map((component) => {
      const response = this.toSolutionComponentResponse(component, {
        table: tableById.get(component.objectId),
        column: columnById.get(component.objectId),
        form: formById.get(component.objectId),
        view: viewById.get(component.objectId),
        parentTable: component.tableId
          ? tableById.get(component.tableId)
          : undefined,
      });
      return {
        ...response,
        source: component.isSystem ? 'System' : 'Custom',
        layerAction: component.layerAction,
        state: stateLabel(component.lifecycleState),
        lifecycleState: component.lifecycleState,
        version: component.version,
        dependencies: [],
      };
    });
  }

  private async resolvePackageObjects(
    currentUser: AuthenticatedUser,
    componentType: CustomizationSolutionComponentType,
    objectIds: string[],
  ) {
    const uniqueIds = [...new Set(objectIds)];
    if (componentType === 'table') {
      const rows = await this.prisma.customizationTable.findMany({
        where: { tenantId: currentUser.tenantId, id: { in: uniqueIds } },
      });
      return rows.map((row) => ({
        objectId: row.id,
        objectKey: row.tableKey,
        tableId: row.id,
        isSystem: row.isSystem,
        isCustom: row.isCustom,
      }));
    }
    if (componentType === 'widget') {
      const tables = await this.prisma.customizationTable.findMany({
        where: { tenantId: currentUser.tenantId },
      });
      return uniqueIds.flatMap((objectId) => {
        const parsed = parseSystemWidgetObjectId(objectId);
        if (!parsed) return [];
        const table = tables.find(
          (candidate) => candidate.tableKey === parsed.moduleKey,
        );
        const widget = listSupportedSystemWidgets(parsed.moduleKey).find(
          (candidate) => candidate.widgetKey === parsed.widgetKey,
        );
        if (!table || !widget) return [];
        return [
          {
            objectId,
            objectKey: `${table.tableKey}.${widget.widgetKey}`,
            tableId: table.id,
            isSystem: true,
            isCustom: false,
            metadataJson: systemWidgetPackageMetadata(widget, table.tableKey),
          },
        ];
      });
    }
    if (componentType === 'column') {
      const rows = await this.prisma.customizationColumn.findMany({
        where: { tenantId: currentUser.tenantId, id: { in: uniqueIds } },
        include: { table: true },
      });
      return rows.map((row) => ({
        objectId: row.id,
        objectKey: `${row.table.tableKey}.${row.columnKey}`,
        tableId: row.tableId,
        isSystem: row.isSystem,
        isCustom: row.isCustom,
      }));
    }
    if (componentType === 'form') {
      const rows = await this.prisma.customizationForm.findMany({
        where: { tenantId: currentUser.tenantId, id: { in: uniqueIds } },
        include: { table: true },
      });
      return rows.map((row) => ({
        objectId: row.id,
        objectKey: `${row.table.tableKey}.${row.formKey}`,
        tableId: row.tableId,
        isSystem: row.isSystem,
        isCustom: row.isCustom,
      }));
    }
    if (componentType === 'view') {
      const rows = await this.prisma.customizationView.findMany({
        where: { tenantId: currentUser.tenantId, id: { in: uniqueIds } },
        include: { table: true },
      });
      return rows.map((row) => ({
        objectId: row.id,
        objectKey: `${row.table.tableKey}.${row.viewKey}`,
        tableId: row.tableId,
        isSystem: row.isSystem,
        isCustom: row.isCustom,
      }));
    }
    throw new BadRequestException(
      'This component type is not backed by metadata storage yet.',
    );
  }

  private async syncDefaultSolution(currentUser: AuthenticatedUser) {
    if (this.syncedDefaultSolutionTenants.has(currentUser.tenantId)) {
      return this.getExistingDefaultSolution(currentUser);
    }

    const pending = this.defaultSolutionSyncPromises.get(currentUser.tenantId);
    if (pending) {
      return pending;
    }

    const syncPromise = this.runDefaultSolutionSyncWithRetry(
      currentUser,
    ).finally(() => {
      this.defaultSolutionSyncPromises.delete(currentUser.tenantId);
    });
    this.defaultSolutionSyncPromises.set(currentUser.tenantId, syncPromise);
    return syncPromise;
  }

  private async runDefaultSolutionSyncWithRetry(
    currentUser: AuthenticatedUser,
  ) {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await this.runDefaultSolutionSync(currentUser);
      } catch (error) {
        if (!isDeadlockError(error) || attempt === maxAttempts) {
          throw error;
        }
        await delay(attempt * 100);
      }
    }
    return this.getExistingDefaultSolution(currentUser);
  }

  private async runDefaultSolutionSync(currentUser: AuthenticatedUser) {
    const solution = await this.ensureDefaultSolution(currentUser);

    for (const definition of SYSTEM_CUSTOMIZATION_TABLES) {
      const table = await this.prisma.customizationTable.upsert({
        where: {
          tenantId_tableKey: {
            tenantId: currentUser.tenantId,
            tableKey: definition.tableKey,
          },
        },
        create: this.buildTableCreateInput(currentUser.tenantId, definition),
        update: {
          isSystem: true,
          isCustom: false,
          moduleKey: definition.moduleKey,
          ownershipType: definition.ownershipType,
          displayOrder: definition.displayOrder,
          isCustomizable: definition.isCustomizable,
          isVisibleInCustomization: definition.isVisibleInCustomization,
          isValidForAdvancedFind: definition.isValidForAdvancedFind,
          isValidForFormDesigner: definition.isValidForFormDesigner,
          isValidForViewDesigner: definition.isValidForViewDesigner,
          isActive: true,
        },
      });

      await this.addDefaultSolutionComponent(currentUser, {
        solutionId: solution.id,
        componentType: 'table',
        objectId: table.id,
        objectKey: table.tableKey,
        tableId: table.id,
        isSystem: true,
        isCustom: false,
      });

      for (const widget of listSupportedSystemWidgets(table.tableKey)) {
        await this.addDefaultSolutionComponent(currentUser, {
          solutionId: solution.id,
          componentType: 'widget',
          objectId: systemWidgetObjectId(table.tableKey, widget.widgetKey),
          objectKey: `${table.tableKey}.${widget.widgetKey}`,
          tableId: table.id,
          isSystem: true,
          isCustom: false,
          metadataJson: systemWidgetPackageMetadata(widget, table.tableKey),
        });
      }

      for (const [index, column] of definition.columns.entries()) {
        const row = await this.prisma.customizationColumn.upsert({
          where: {
            tenantId_tableId_columnKey: {
              tenantId: currentUser.tenantId,
              tableId: table.id,
              columnKey: column.columnKey,
            },
          },
          create: this.buildColumnData(
            currentUser.tenantId,
            table.id,
            {
              columnKey: column.columnKey,
              displayName: column.displayName,
              dataType: column.dataType as CustomizationFieldDataType,
              fieldType: column.dataType as CustomizationFieldDataType,
              isRequired: column.isRequired ?? false,
              isReadOnly: column.isReadOnly ?? true,
              isSearchable: column.isSearchable ?? false,
              isFilterable: column.isFilterable ?? true,
              isSortable: column.isSortable ?? true,
              isVisible: column.isVisible ?? true,
              isVisibleInCustomization: column.isVisibleInCustomization ?? true,
              isValidForFormDesigner: column.isValidForFormDesigner ?? true,
              isValidForViewDesigner: column.isValidForViewDesigner ?? true,
              sortOrder: column.sortOrder ?? index * 10,
            },
            true,
            column.columnKey,
          ),
          update: {
            isSystem: true,
            isCustom: false,
            displayName: column.displayName,
            isRequired: column.isRequired ?? false,
            isReadOnly: column.isReadOnly ?? true,
            isSearchable: column.isSearchable ?? false,
            isFilterable: column.isFilterable ?? true,
            isSortable: column.isSortable ?? true,
            isVisible: column.isVisible ?? true,
            isVisibleInCustomization: column.isVisibleInCustomization ?? true,
            isValidForFormDesigner: column.isValidForFormDesigner ?? true,
            isValidForViewDesigner: column.isValidForViewDesigner ?? true,
            sortOrder: column.sortOrder ?? index * 10,
          },
        });

        await this.addDefaultSolutionComponent(currentUser, {
          solutionId: solution.id,
          componentType: 'column',
          objectId: row.id,
          objectKey: `${table.tableKey}.${row.columnKey}`,
          tableId: table.id,
          isSystem: true,
          isCustom: false,
        });
      }

      const columns = await this.prisma.customizationColumn.findMany({
        where: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          isActive: true,
          isVisible: true,
          isVisibleInCustomization: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { columnKey: 'asc' }],
      });
      const formColumns = columns.filter(isDesignerColumn);
      const viewColumns = columns.filter(isViewDesignerColumn);

      const form = await this.prisma.customizationForm.upsert({
        where: {
          tenantId_tableId_formKey: {
            tenantId: currentUser.tenantId,
            tableId: table.id,
            formKey: 'main',
          },
        },
        create: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          formKey: 'main',
          name: `${table.displayName} Main Form`,
          description: `Default system form for ${table.displayName}.`,
          type: CustomizationFormType.main,
          isDefault: true,
          isActive: true,
          isSystem: true,
          isCustom: false,
          layoutJson: buildDefaultFormLayout(table, formColumns),
        },
        update: {
          isSystem: true,
          isCustom: false,
          layoutJson: buildDefaultFormLayout(table, formColumns),
        },
      });

      await this.addDefaultSolutionComponent(currentUser, {
        solutionId: solution.id,
        componentType: 'form',
        objectId: form.id,
        objectKey: `${table.tableKey}.${form.formKey}`,
        tableId: table.id,
        isSystem: true,
        isCustom: false,
      });

      const view = await this.prisma.customizationView.upsert({
        where: {
          tenantId_tableId_viewKey: {
            tenantId: currentUser.tenantId,
            tableId: table.id,
            viewKey: 'active',
          },
        },
        create: {
          tenantId: currentUser.tenantId,
          tableId: table.id,
          viewKey: 'active',
          name: `Active ${table.pluralDisplayName}`,
          description: `Default active ${table.pluralDisplayName} view.`,
          type: 'system',
          isDefault: true,
          isHidden: false,
          isSystem: true,
          isCustom: false,
          columnsJson: buildDefaultViewColumns(viewColumns),
          filtersJson: [],
          sortingJson: buildDefaultViewSorting(viewColumns),
          visibilityScope: 'tenant',
        },
        update: {
          isSystem: true,
          isCustom: false,
        },
      });

      await this.addDefaultSolutionComponent(currentUser, {
        solutionId: solution.id,
        componentType: 'view',
        objectId: view.id,
        objectKey: `${table.tableKey}.${view.viewKey}`,
        tableId: table.id,
        isSystem: true,
        isCustom: false,
      });

      await this.addDefaultSolutionComponent(currentUser, {
        solutionId: solution.id,
        componentType: 'actionBar',
        objectId: `system-action-bar:${table.tableKey}`,
        objectKey: `${table.tableKey}.system.actionBar`,
        tableId: table.id,
        isSystem: true,
        isCustom: false,
        metadataJson: {
          source: 'runtime-registered',
          scope: 'module',
          actions: [
            'system.new',
            'system.edit',
            'system.delete',
            'system.refresh',
            'record.assignOwner',
            'record.share',
            'system.import',
            'system.export',
            'system.exportTemplate',
            'system.back',
            'system.save',
            'system.saveAndClose',
          ],
        },
      });
    }

    this.syncedDefaultSolutionTenants.add(currentUser.tenantId);
    return solution;
  }

  private ensureDefaultSolution(currentUser: AuthenticatedUser) {
    return this.prisma.customizationSolution.upsert({
      where: {
        tenantId_solutionKey: {
          tenantId: currentUser.tenantId,
          solutionKey: 'default',
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        solutionKey: 'default',
        displayName: 'Default Solution',
        description:
          'Built-in tenant solution containing all system and custom metadata components.',
        scope: 'tenant',
        isDefault: true,
        isSystem: true,
        isManaged: false,
        isActive: true,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
      update: {
        displayName: 'Default Solution',
        isDefault: true,
        isSystem: true,
        isActive: true,
        updatedByUserId: currentUser.userId,
      },
    });
  }

  private async getExistingDefaultSolution(currentUser: AuthenticatedUser) {
    const solution = await this.prisma.customizationSolution.findUnique({
      where: {
        tenantId_solutionKey: {
          tenantId: currentUser.tenantId,
          solutionKey: 'default',
        },
      },
    });
    return solution ?? this.ensureDefaultSolution(currentUser);
  }

  private async addDefaultSolutionComponent(
    currentUser: AuthenticatedUser,
    component: {
      solutionId?: string;
      componentType: CustomizationSolutionComponentType;
      objectId: string;
      objectKey: string;
      tableId?: string | null;
      isSystem: boolean;
      isCustom: boolean;
      baseComponentId?: string | null;
      layerAction?: string;
      lifecycleState?: string;
      layerOrder?: number;
      version?: string;
      metadataJson?: Prisma.InputJsonValue;
    },
  ) {
    const solution = component.solutionId
      ? await this.findPackageOrThrow(currentUser, component.solutionId)
      : await this.ensureDefaultSolution(currentUser);
    const solutionId = solution.id;
    const isDefaultBaseComponent =
      solution.isDefault && solution.isSystem && component.isSystem;
    return this.prisma.customizationSolutionComponent.upsert({
      where: {
        solutionId_componentType_objectId: {
          solutionId,
          componentType: component.componentType,
          objectId: component.objectId,
        },
      },
      create: {
        tenantId: currentUser.tenantId,
        solutionId,
        componentType: component.componentType,
        objectId: component.objectId,
        objectKey: component.objectKey,
        tableId: component.tableId ?? null,
        isSystem: component.isSystem,
        isCustom: component.isCustom,
        isManaged: false,
        baseComponentId: component.baseComponentId ?? null,
        layerAction:
          component.layerAction ??
          (component.isSystem ? 'reference' : 'create'),
        lifecycleState:
          component.lifecycleState ??
          (isDefaultBaseComponent ? 'published' : 'draft'),
        layerOrder:
          component.layerOrder ?? (isDefaultBaseComponent ? 100 : 300),
        version: component.version ?? '1.0.0',
        checksum: checksumFor({
          componentType: component.componentType,
          objectId: component.objectId,
          objectKey: component.objectKey,
          tableId: component.tableId ?? null,
          layerAction:
            component.layerAction ??
            (component.isSystem ? 'reference' : 'create'),
          metadataJson: component.metadataJson ?? null,
        }),
        metadataJson: component.metadataJson ?? Prisma.JsonNull,
        createdByUserId: currentUser.userId,
        updatedByUserId: currentUser.userId,
      },
      update: {
        objectKey: component.objectKey,
        tableId: component.tableId ?? null,
        isSystem: component.isSystem,
        isCustom: component.isCustom,
        ...(component.baseComponentId !== undefined
          ? { baseComponentId: component.baseComponentId }
          : {}),
        ...(component.layerAction
          ? { layerAction: component.layerAction }
          : {}),
        lifecycleState:
          component.lifecycleState ??
          (isDefaultBaseComponent ? 'published' : 'draft'),
        layerOrder:
          component.layerOrder ?? (isDefaultBaseComponent ? 100 : 300),
        ...(component.version ? { version: component.version } : {}),
        ...(component.metadataJson !== undefined
          ? { metadataJson: component.metadataJson ?? Prisma.JsonNull }
          : {}),
        checksum: checksumFor({
          componentType: component.componentType,
          objectId: component.objectId,
          objectKey: component.objectKey,
          tableId: component.tableId ?? null,
          layerAction:
            component.layerAction ??
            (component.isSystem ? 'reference' : 'create'),
          metadataJson: component.metadataJson ?? null,
        }),
        updatedByUserId: currentUser.userId,
      },
    });
  }

  private ensurePackageModuleMembership(
    currentUser: AuthenticatedUser,
    solutionId: string,
    table: CustomizationTable,
  ) {
    return this.addDefaultSolutionComponent(currentUser, {
      solutionId,
      componentType: 'table',
      objectId: table.id,
      objectKey: table.tableKey,
      tableId: table.id,
      isSystem: table.isSystem,
      isCustom: table.isCustom,
      baseComponentId: table.isSystem ? table.id : null,
      layerAction: 'reference',
      lifecycleState: 'draft',
      layerOrder: 200,
      metadataJson: {
        sourceComponentType: 'table',
        sourceObjectId: table.id,
        sourceObjectKey: table.tableKey,
        autoAddedForChildComponent: true,
      },
    });
  }

  private toSolutionComponentResponse(
    component: {
      id: string;
      componentType: CustomizationSolutionComponentType;
      objectId: string;
      objectKey: string;
      tableId: string | null;
      isSystem: boolean;
      isCustom: boolean;
      isManaged: boolean;
      baseComponentId?: string | null;
      layerAction?: string;
      lifecycleState?: string;
      layerOrder?: number;
      version?: string;
      checksum?: string | null;
      metadataJson?: Prisma.JsonValue | null;
      publishedAt?: Date | null;
      publishedByUserId?: string | null;
      updatedAt: Date;
    },
    related: {
      table?: CustomizationTable;
      parentTable?: CustomizationTable;
      column?: CustomizationColumn;
      form?: CustomizationForm;
      view?: CustomizationView;
    },
  ) {
    const source =
      related.table ?? related.column ?? related.form ?? related.view ?? null;
    const displayName =
      related.table?.displayName ??
      related.column?.displayName ??
      related.form?.name ??
      related.view?.name ??
      component.objectKey;
    const logicalName =
      related.table?.tableKey ??
      related.column?.columnKey ??
      related.form?.formKey ??
      related.view?.viewKey ??
      component.objectKey;

    return {
      id: component.id,
      componentType: component.componentType,
      objectId: component.objectId,
      objectKey: component.objectKey,
      tableKey:
        related.parentTable?.tableKey ?? related.table?.tableKey ?? null,
      tableDisplayName:
        related.parentTable?.displayName ?? related.table?.displayName ?? null,
      moduleKey:
        related.parentTable?.moduleKey ?? related.table?.moduleKey ?? null,
      moduleLabel:
        related.parentTable?.moduleKey ?? related.table?.moduleKey ?? null,
      displayName,
      logicalName,
      isSystem: component.isSystem,
      isCustom: component.isCustom,
      isManaged: component.isManaged,
      baseComponentId: component.baseComponentId ?? null,
      layerAction:
        component.layerAction ?? (component.isSystem ? 'reference' : 'create'),
      lifecycleState:
        component.lifecycleState ??
        (component.isSystem ? 'published' : 'draft'),
      layerOrder: component.layerOrder ?? (component.isSystem ? 100 : 300),
      version: component.version ?? '1.0.0',
      checksum: component.checksum ?? null,
      metadataJson: component.metadataJson ?? null,
      publishedAt: component.publishedAt ?? null,
      publishedByUserId: component.publishedByUserId ?? null,
      isActive:
        'isActive' in (source ?? {})
          ? Boolean((source as { isActive?: boolean }).isActive)
          : related.view
            ? !related.view.isHidden
            : true,
      isVisibleInCustomization:
        related.table?.isVisibleInCustomization ??
        related.column?.isVisibleInCustomization ??
        related.parentTable?.isVisibleInCustomization ??
        true,
      isValidForFormDesigner:
        related.table?.isValidForFormDesigner ??
        related.column?.isValidForFormDesigner ??
        related.parentTable?.isValidForFormDesigner ??
        true,
      isValidForViewDesigner:
        related.table?.isValidForViewDesigner ??
        related.column?.isValidForViewDesigner ??
        related.parentTable?.isValidForViewDesigner ??
        true,
      updatedAt: component.updatedAt,
    };
  }

  private getFirstTableForModule(moduleKey: string) {
    const table = SYSTEM_CUSTOMIZATION_TABLES.find(
      (definition) =>
        definition.moduleKey === moduleKey || definition.tableKey === moduleKey,
    );
    if (!table) {
      throw new BadRequestException(
        'Only existing system modules can be customized in this phase.',
      );
    }
    return table;
  }

  private ensureCustomizationTable(tenantId: string, tableKey: string) {
    const definition = findSystemCustomizationTable(tableKey);
    if (definition) {
      return this.prisma.customizationTable.upsert({
        where: {
          tenantId_tableKey: { tenantId, tableKey },
        },
        create: this.buildTableCreateInput(tenantId, definition),
        update: {
          moduleKey: definition.moduleKey,
          ownershipType: definition.ownershipType,
          displayOrder: definition.displayOrder,
          isCustomizable: definition.isCustomizable,
          isVisibleInCustomization: definition.isVisibleInCustomization,
          isValidForAdvancedFind: definition.isValidForAdvancedFind,
          isValidForFormDesigner: definition.isValidForFormDesigner,
          isValidForViewDesigner: definition.isValidForViewDesigner,
          isActive: true,
        },
      });
    }

    return this.findTenantTableOrThrow(tenantId, tableKey);
  }

  private async validateLookupTarget(
    tenantId: string,
    lookupTargetTableKey?: string,
  ) {
    if (!lookupTargetTableKey) {
      return;
    }

    if (findSystemCustomizationTable(lookupTargetTableKey)) {
      return;
    }
    const existing = await this.prisma.customizationTable.findUnique({
      where: {
        tenantId_tableKey: {
          tenantId,
          tableKey: lookupTargetTableKey,
        },
      },
    });
    if (!existing) {
      throw new BadRequestException(
        'Lookup target table must be an existing customizable table.',
      );
    }
  }

  private validateValueRules(
    dto: Pick<
      CreateCustomizationColumnDto,
      'maxLength' | 'minValue' | 'maxValue' | 'optionSetJson'
    >,
  ) {
    if (
      dto.minValue !== undefined &&
      dto.maxValue !== undefined &&
      Number(dto.minValue) > Number(dto.maxValue)
    ) {
      throw new BadRequestException(
        'Minimum value cannot exceed maximum value.',
      );
    }

    if (dto.maxLength !== undefined && dto.maxLength < 1) {
      throw new BadRequestException('Maximum length must be at least 1.');
    }

    if (dto.optionSetJson !== undefined) {
      const values = Array.isArray(dto.optionSetJson)
        ? dto.optionSetJson
        : Array.isArray(dto.optionSetJson.options)
          ? dto.optionSetJson.options
          : null;
      if (!values) {
        throw new BadRequestException(
          'Option set JSON must include an options array.',
        );
      }
    }
  }

  private assertSafeFieldTypeChange(
    currentType: CustomizationFieldDataType,
    nextType: CustomizationFieldDataType,
  ) {
    if (currentType === nextType) {
      return;
    }

    const compatibleGroups: CustomizationFieldDataType[][] = [
      ['text', 'textarea', 'email', 'phone', 'url'],
      ['number', 'decimal', 'currency'],
      ['date', 'datetime'],
    ];
    const isCompatible = compatibleGroups.some(
      (group) => group.includes(currentType) && group.includes(nextType),
    );

    if (!isCompatible) {
      throw new BadRequestException(
        `Changing field type from ${currentType} to ${nextType} is not safe.`,
      );
    }
  }

  private async validateViewMetadata(
    currentUser: AuthenticatedUser,
    tableKey: string,
    metadata: {
      columnsJson?: unknown;
      filtersJson?: unknown;
      sortingJson?: unknown;
    },
  ) {
    assertViewMetadataShape(metadata);
    const validColumnKeys = await this.getValidColumnKeySet(
      currentUser,
      tableKey,
      'view',
    );
    this.assertReferencedColumnsExist(
      'View columns',
      extractColumnRefs(metadata.columnsJson, true),
      validColumnKeys,
    );
    this.assertReferencedColumnsExist(
      'View filters',
      extractColumnRefs(metadata.filtersJson),
      validColumnKeys,
    );
    this.assertReferencedColumnsExist(
      'View sorting',
      extractColumnRefs(metadata.sortingJson),
      validColumnKeys,
    );
  }

  private async validateFormLayout(
    currentUser: AuthenticatedUser,
    tableKey: string,
    layoutJson: unknown,
  ) {
    assertFormLayoutShape(layoutJson);
    const validColumnKeys = await this.getValidColumnKeySet(
      currentUser,
      tableKey,
      'form',
    );
    this.assertReferencedColumnsExist(
      'Form layout',
      extractColumnRefs(layoutJson, true),
      validColumnKeys,
    );
  }

  private async assertDefaultFormContainsRequiredColumns(
    currentUser: AuthenticatedUser,
    tableKey: string,
    layoutJson: unknown,
  ) {
    const columns = (await this.listColumns(currentUser, tableKey)).filter(
      isDesignerColumn,
    );
    const requiredColumnKeys = columns
      .filter((column) => column.isRequired)
      .map((column) => column.columnKey);
    if (requiredColumnKeys.length === 0) {
      return;
    }

    const visibleFormFields = extractVisibleFormFieldRefs(layoutJson);
    const missingRequired = requiredColumnKeys.filter(
      (columnKey) => !visibleFormFields.has(columnKey),
    );
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `Default forms must include required fields: ${missingRequired.join(', ')}.`,
      );
    }
  }

  private async getValidColumnKeySet(
    currentUser: AuthenticatedUser,
    tableKey: string,
    purpose: 'form' | 'view' | 'any' = 'any',
  ) {
    const columns = await this.listColumns(currentUser, tableKey);
    const allowedColumns =
      purpose === 'form'
        ? columns.filter(isDesignerColumn)
        : purpose === 'view'
          ? columns.filter(isViewDesignerColumn)
          : columns;
    return new Set(allowedColumns.map((column) => column.columnKey));
  }

  private assertReferencedColumnsExist(
    label: string,
    references: Set<string>,
    validColumnKeys: Set<string>,
  ) {
    const invalid = [...references].filter(
      (columnKey) => !validColumnKeys.has(columnKey),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `${label} reference unknown columns: ${invalid.join(', ')}.`,
      );
    }
  }

  private buildTableCreateInput(
    tenantId: string,
    definition: SystemTableDefinition,
  ): Prisma.CustomizationTableUncheckedCreateInput {
    return {
      tenantId,
      tableKey: definition.tableKey,
      systemName: definition.systemName,
      displayName: definition.displayName,
      pluralDisplayName: definition.pluralName,
      description: definition.description,
      icon: definition.icon,
      ownershipType: definition.ownershipType,
      moduleKey: definition.moduleKey,
      displayOrder: definition.displayOrder,
      isSystem: true,
      isCustom: false,
      isCustomizable: definition.isCustomizable,
      isVisibleInCustomization: definition.isVisibleInCustomization,
      isValidForAdvancedFind: definition.isValidForAdvancedFind,
      isValidForFormDesigner: definition.isValidForFormDesigner,
      isValidForViewDesigner: definition.isValidForViewDesigner,
      isActive: true,
    };
  }

  private buildColumnData(
    tenantId: string,
    tableId: string,
    dto: CreateCustomizationColumnDto,
    isSystem: boolean,
    systemName = dto.columnKey,
  ): Prisma.CustomizationColumnUncheckedCreateInput {
    return {
      tenantId,
      tableId,
      columnKey: dto.columnKey,
      systemName,
      displayName: dto.displayName.trim(),
      description: dto.description?.trim(),
      dataType: dto.dataType,
      fieldType: dto.fieldType ?? dto.dataType,
      isSystem,
      isCustom: !isSystem,
      isActive: true,
      isRequired: dto.isRequired ?? false,
      isSearchable: dto.isSearchable ?? false,
      isFilterable: dto.isFilterable ?? false,
      isSortable: dto.isSortable ?? false,
      isVisible: dto.isVisible ?? true,
      isVisibleInCustomization: dto.isVisible ?? true,
      isValidForFormDesigner: dto.isVisible ?? true,
      isValidForViewDesigner: dto.isVisible ?? true,
      isReadOnly: dto.isReadOnly ?? false,
      maxLength: dto.maxLength,
      minValue: dto.minValue,
      maxValue: dto.maxValue,
      defaultValue: dto.defaultValue,
      lookupTargetTableKey: dto.lookupTargetTableKey,
      optionSetJson: dto.optionSetJson as Prisma.InputJsonValue | undefined,
      validationJson: dto.validationJson as Prisma.InputJsonValue | undefined,
      sortOrder: dto.sortOrder ?? 0,
    };
  }

  private toTableResponse(
    definition: SystemTableDefinition | null,
    row?: CustomizationTable,
    effectiveCounts?: {
      actionBars: Set<string>;
      choiceLists: Set<string>;
      fields: Set<string>;
      forms: Set<string>;
      relationships: Set<string>;
      views: Set<string>;
    },
  ) {
    if (!definition && !row) {
      throw new NotFoundException('Customization table was not found.');
    }
    const tableKey = definition?.tableKey ?? row!.tableKey;
    return {
      id: row?.id ?? null,
      tableKey,
      moduleKey: row?.moduleKey ?? definition?.moduleKey ?? 'custom',
      systemName:
        row?.systemName ?? definition?.systemName ?? pascalize(tableKey),
      displayName: row?.displayName ?? definition?.displayName ?? tableKey,
      pluralName:
        row?.pluralDisplayName ?? definition?.pluralName ?? `${tableKey}`,
      pluralDisplayName:
        row?.pluralDisplayName ?? definition?.pluralName ?? `${tableKey}`,
      description: row?.description ?? definition?.description ?? null,
      icon: row?.icon ?? definition?.icon ?? null,
      ownershipType: row?.ownershipType ?? definition?.ownershipType ?? null,
      displayOrder: row?.displayOrder ?? definition?.displayOrder ?? 0,
      isCustomizable: row?.isCustomizable ?? definition?.isCustomizable ?? true,
      isVisibleInCustomization:
        row?.isVisibleInCustomization ??
        definition?.isVisibleInCustomization ??
        true,
      isValidForAdvancedFind:
        row?.isValidForAdvancedFind ??
        definition?.isValidForAdvancedFind ??
        true,
      isValidForFormDesigner:
        row?.isValidForFormDesigner ??
        definition?.isValidForFormDesigner ??
        true,
      isValidForViewDesigner:
        row?.isValidForViewDesigner ??
        definition?.isValidForViewDesigner ??
        true,
      isEnabled: row?.isActive ?? true,
      isActive: row?.isActive ?? true,
      isSystem: row?.isSystem ?? Boolean(definition),
      isCustom: row?.isCustom ?? !definition,
      isCustomTable: row?.isCustom ?? !definition,
      publishedAt: null,
      fieldsCount: effectiveCounts?.fields.size ?? 0,
      formsCount: effectiveCounts?.forms.size ?? 0,
      viewsCount: effectiveCounts?.views.size ?? 0,
      choiceListsCount: effectiveCounts?.choiceLists.size ?? 0,
      relationshipsCount: effectiveCounts?.relationships.size ?? 0,
      actionBarsCount: effectiveCounts?.actionBars.size ?? 0,
      source: (row?.isSystem ?? Boolean(definition)) ? 'System' : 'Custom',
      packageName:
        (row?.isSystem ?? Boolean(definition)) ? 'Default Package' : null,
      lifecycleState: 'published',
      createdAt: row?.createdAt ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  private async findTenantTableOrThrow(tenantId: string, tableKey: string) {
    const table = await this.prisma.customizationTable.findUnique({
      where: { tenantId_tableKey: { tenantId, tableKey } },
    });
    if (!table) {
      throw new NotFoundException('Customization table was not found.');
    }
    return table;
  }

  private async getTableDependencySummary(
    tenantId: string,
    table: CustomizationTable,
  ) {
    const [columns, forms, views] = await Promise.all([
      this.prisma.customizationColumn.count({
        where: { tenantId, tableId: table.id },
      }),
      this.prisma.customizationForm.count({
        where: { tenantId, tableId: table.id },
      }),
      this.prisma.customizationView.count({
        where: { tenantId, tableId: table.id },
      }),
    ]);
    return {
      tableKey: table.tableKey,
      columns,
      forms,
      views,
      total: columns + forms + views,
    };
  }

  private async getColumnDependencySummary(
    tenantId: string,
    table: CustomizationTable,
    columnKey: string,
  ) {
    const [forms, views] = await Promise.all([
      this.prisma.customizationForm.findMany({
        where: { tenantId, tableId: table.id, isActive: true },
        select: { formKey: true, name: true, layoutJson: true },
      }),
      this.prisma.customizationView.findMany({
        where: { tenantId, tableId: table.id, isHidden: false },
        select: {
          viewKey: true,
          name: true,
          columnsJson: true,
          filtersJson: true,
          sortingJson: true,
        },
      }),
    ]);
    const formReferences = forms
      .filter((form) => extractColumnRefs(form.layoutJson, true).has(columnKey))
      .map((form) => ({ key: form.formKey, name: form.name }));
    const viewReferences = views
      .filter((view) => {
        const references = new Set([
          ...extractColumnRefs(view.columnsJson, true),
          ...extractColumnRefs(view.filtersJson),
          ...extractColumnRefs(view.sortingJson),
        ]);
        return references.has(columnKey);
      })
      .map((view) => ({ key: view.viewKey, name: view.name }));

    return {
      tableKey: table.tableKey,
      columnKey,
      forms: formReferences,
      views: viewReferences,
      total: formReferences.length + viewReferences.length,
    };
  }
}

type PublishDraft = {
  tables: CustomizationTable[];
  columns: CustomizationColumn[];
  views: CustomizationView[];
  forms: CustomizationForm[];
};

type PublishValidationError = {
  scope: 'table' | 'column' | 'view' | 'form';
  tableKey?: string;
  entityKey?: string;
  message: string;
};

type PackageComponentSummary = {
  draft: number;
  published: number;
  total: number;
};

type EffectivePublishColumn = {
  columnKey: string;
  dataType: string;
  fieldType: string;
  isSystem: boolean;
  isRequired: boolean;
  isVisible: boolean;
  lookupTargetTableKey?: string | null;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizePublishedSnapshot(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return value;
  }

  const snapshot = value as Record<string, Prisma.JsonValue>;
  const effectiveMetadata = snapshot.effectiveMetadata;
  if (
    effectiveMetadata &&
    !Array.isArray(effectiveMetadata) &&
    typeof effectiveMetadata === 'object'
  ) {
    return {
      ...(effectiveMetadata as Record<string, Prisma.JsonValue>),
      ...snapshot,
    };
  }

  return snapshot;
}

function isDeadlockError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return message.includes('deadlock detected') || message.includes('40P01');
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function buildDefaultFormLayout(
  table: CustomizationTable,
  columns: CustomizationColumn[],
): Prisma.InputJsonValue {
  const fields = columns
    .filter((column) => column.isVisible)
    .slice(0, 24)
    .map((column, index) => ({
      columnKey: column.columnKey,
      label: column.displayName,
      required: column.isRequired,
      readOnly: column.isReadOnly,
      isVisible: column.isVisible,
      sequence: index * 10,
    }));

  return toJsonValue({
    columns: 3,
    tabs: [
      {
        id: 'summary',
        label: 'Summary',
        columns: 3,
        sequence: 10,
        sections: [
          {
            id: 'general',
            label: 'General',
            labelVisible: true,
            columns: 3,
            layout: 'threeColumns',
            isVisible: true,
            sequence: 10,
            fields,
          },
        ],
      },
    ],
    metadata: {
      tableKey: table.tableKey,
      generatedBy: 'default-solution-sync',
    },
  });
}

function buildDefaultViewColumns(
  columns: CustomizationColumn[],
): Prisma.InputJsonValue {
  return toJsonValue(
    columns
      .filter((column) => column.isVisible)
      .slice(0, 8)
      .map((column, index) => ({
        columnKey: column.columnKey,
        label: column.displayName,
        width: column.dataType === 'textarea' ? 320 : 180,
        sequence: index * 10,
      })),
  );
}

function buildDefaultViewSorting(
  columns: CustomizationColumn[],
): Prisma.InputJsonValue {
  const sortColumn =
    columns.find((column) => column.columnKey === 'updatedAt') ??
    columns.find((column) => column.columnKey === 'createdAt') ??
    columns.find((column) => column.isSortable) ??
    columns[0];

  return toJsonValue(
    sortColumn
      ? [{ columnKey: sortColumn.columnKey, direction: 'desc', sequence: 10 }]
      : [],
  );
}

function assertFormLayoutShape(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Form layout must be a JSON object.');
  }
  const tabs = (value as { tabs?: unknown }).tabs;
  if (!Array.isArray(tabs)) {
    throw new BadRequestException('Form layout must include a tabs array.');
  }
  for (const tab of tabs) {
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) {
      throw new BadRequestException('Each form tab must be an object.');
    }
    const sections = (tab as { sections?: unknown }).sections;
    if (!Array.isArray(sections)) {
      throw new BadRequestException('Each form tab must include sections.');
    }
    for (const section of sections) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        throw new BadRequestException('Each form section must be an object.');
      }
      const fields = (section as { fields?: unknown }).fields;
      if (!Array.isArray(fields)) {
        throw new BadRequestException('Each form section must include fields.');
      }
    }
  }
}

function assertViewMetadataShape(metadata: {
  columnsJson?: unknown;
  filtersJson?: unknown;
  sortingJson?: unknown;
}) {
  if (
    metadata.columnsJson !== undefined &&
    !Array.isArray(metadata.columnsJson) &&
    (typeof metadata.columnsJson !== 'object' || metadata.columnsJson === null)
  ) {
    throw new BadRequestException('View columns must be an array or object.');
  }
  if (
    metadata.filtersJson !== undefined &&
    metadata.filtersJson !== null &&
    !Array.isArray(metadata.filtersJson) &&
    typeof metadata.filtersJson !== 'object'
  ) {
    throw new BadRequestException('View filters must be an array or object.');
  }
  if (
    metadata.sortingJson !== undefined &&
    metadata.sortingJson !== null &&
    !Array.isArray(metadata.sortingJson) &&
    typeof metadata.sortingJson !== 'object'
  ) {
    throw new BadRequestException('View sorting must be an array or object.');
  }
}

function slugKey(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function pascalize(value: string) {
  const words = value
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function publisherPrefix(value: string) {
  const words = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  const letters =
    words.length > 1
      ? words.map((word) => word[0]).join('')
      : (words[0] ?? 'dp').slice(0, 2).padEnd(2, 'a');
  const prefix = letters || 'dp';
  return `${prefix.toLowerCase().replace(/[^a-z0-9]/g, '')}_`;
}

function extractPackagePrefix(value: string) {
  const match = value.match(/^([a-z][a-z0-9]*_)/);
  return match?.[1] ?? '';
}

function camelize(value: string) {
  const words = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0
        ? lower
        : `${lower[0]?.toUpperCase() ?? ''}${lower.slice(1)}`;
    })
    .join('');
}

function findDuplicates(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

function checksumFor(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function nextPatchVersion(value?: string | null) {
  const parts = (value ?? '1.0.0')
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  const [major = 1, minor = 0, patch = 0] = parts.map((part) =>
    Number.isFinite(part) ? part : 0,
  );
  return `${major}.${minor}.${patch + 1}`;
}

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toSolutionComponentType(
  value?: string,
): CustomizationSolutionComponentType | null {
  const normalized = (value ?? '').trim();
  const map: Record<string, CustomizationSolutionComponentType> = {
    module: 'table',
    table: 'table',
    field: 'column',
    column: 'column',
    form: 'form',
    view: 'view',
    choiceList: 'optionSet',
    optionSet: 'optionSet',
    relationship: 'lookup',
    lookup: 'lookup',
    actionBar: 'actionBar',
    widget: 'widget',
  };
  if (!normalized) return null;
  return map[normalized] ?? null;
}

function systemWidgetObjectId(moduleKey: string, widgetKey: string) {
  return `system-widget:${moduleKey}:${widgetKey}`;
}

function parseSystemWidgetObjectId(value: string) {
  const match = /^system-widget:([^:]+):(system\..+)$/.exec(value);
  return match
    ? { moduleKey: match[1] ?? '', widgetKey: match[2] ?? '' }
    : null;
}

function systemWidgetPackageMetadata(
  widget: SystemWidgetDefinition,
  moduleKey: string,
): Prisma.InputJsonValue {
  return toJsonValue({
    widgetKey: widget.widgetKey,
    displayName: widget.displayName,
    widgetType: widget.widgetType,
    moduleKey,
    supportedFormComponentTypes: widget.supportedFormComponentTypes,
    requiredDataAdapterMethods: widget.requiredDataAdapterMethods,
    requiredPermissions: widget.requiredPermissions,
    allowedRoles: widget.allowedRoles,
    savedRecordRequired: widget.savedRecordRequired,
    source: 'system-widget-registry',
    customExecutionEnabled: false,
  });
}

function localComponentName(value: string) {
  return value.split('.').pop() || value;
}

function jsonReferencesAny(value: unknown, references: readonly string[]) {
  if (value === null || value === undefined) return false;
  const serialized = JSON.stringify(value);
  return references.some(
    (reference) =>
      reference.length > 0 && serialized.includes(`"${reference}"`),
  );
}

function buildEffectivePublishColumns(
  definition: SystemTableDefinition | null,
  rows: CustomizationColumn[],
): EffectivePublishColumn[] {
  const rowByKey = new Map(rows.map((row) => [row.columnKey, row]));
  const systemColumns = (definition?.columns ?? []).map((column) => {
    const row = rowByKey.get(column.columnKey);

    return {
      columnKey: column.columnKey,
      dataType: row?.dataType ?? column.dataType,
      fieldType: row?.fieldType ?? row?.dataType ?? column.dataType,
      isSystem: true,
      isRequired: row?.isRequired ?? column.isRequired ?? false,
      isVisible: row?.isVisible ?? true,
      lookupTargetTableKey: row?.lookupTargetTableKey ?? null,
    };
  });
  const tenantColumns = rows
    .filter(
      (row) =>
        !row.isSystem &&
        !(definition?.columns ?? []).some(
          (column) => column.columnKey === row.columnKey,
        ),
    )
    .map((row) => ({
      columnKey: row.columnKey,
      dataType: row.dataType,
      fieldType: row.fieldType,
      isSystem: false,
      isRequired: row.isRequired,
      isVisible: row.isVisible,
      lookupTargetTableKey: row.lookupTargetTableKey,
    }));

  return [...systemColumns, ...tenantColumns];
}

function groupBy<T>(
  values: T[],
  getKey: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

function pushInvalidColumnReferenceErrors(
  errors: PublishValidationError[],
  scope: 'view' | 'form',
  tableKey: string,
  entityKey: string,
  label: string,
  references: Set<string>,
  validColumnKeys: Set<string>,
) {
  const invalid = [...references].filter(
    (columnKey) => !validColumnKeys.has(columnKey),
  );
  if (invalid.length === 0) {
    return;
  }

  errors.push({
    scope,
    tableKey,
    entityKey,
    message: `${label} reference unavailable columns: ${invalid.join(', ')}.`,
  });
}

function extractVisibleFormFieldRefs(value: unknown, refs = new Set<string>()) {
  if (!value) {
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractVisibleFormFieldRefs(item, refs);
    }
    return refs;
  }

  if (typeof value !== 'object') {
    return refs;
  }

  const record = value as Record<string, unknown>;
  const columnKey =
    typeof record.columnKey === 'string'
      ? record.columnKey
      : typeof record.fieldKey === 'string'
        ? record.fieldKey
        : typeof record.field === 'string'
          ? record.field
          : null;
  if (columnKey && record.isVisible !== false) {
    refs.add(columnKey);
  }

  for (const item of Object.values(record)) {
    if (typeof item === 'object' && item !== null) {
      extractVisibleFormFieldRefs(item, refs);
    }
  }

  return refs;
}

function extractColumnRefs(
  value: unknown,
  includeBareStrings = false,
  refs = new Set<string>(),
) {
  if (!value) {
    return refs;
  }

  if (typeof value === 'string') {
    if (!includeBareStrings) {
      return refs;
    }
    refs.add(value);
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractColumnRefs(item, includeBareStrings, refs);
    }
    return refs;
  }

  if (typeof value !== 'object') {
    return refs;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['columnKey', 'fieldKey', 'field', 'accessorKey']) {
    const candidate = record[key];
    if (typeof candidate === 'string') {
      refs.add(candidate);
    }
  }

  for (const item of Object.values(record)) {
    if (typeof item === 'object' && item !== null) {
      extractColumnRefs(item, false, refs);
    } else if (Array.isArray(item)) {
      extractColumnRefs(item, false, refs);
    }
  }

  return refs;
}
