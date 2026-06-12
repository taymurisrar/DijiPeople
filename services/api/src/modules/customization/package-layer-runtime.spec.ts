import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CustomizationSolutionComponentType } from '@prisma/client';
import {
  buildMetadataInvalidationKeys,
  resolveEffectivePackageComponents,
  validatePackageLayerEdit,
  type PackageLayerComponent,
} from './package-layer-runtime';
import { validatePackageComponentDependencies } from './dependency-validation';

type Metadata = Record<string, unknown>;
type Component = PackageLayerComponent<Metadata> & {
  packageId: string;
};

describe('generic package metadata lifecycle', () => {
  it('activates a custom Field attached to a Form only after publish', () => {
    const draft = [
      base('module', 'module.people', { fields: ['field.name'] }),
      base('field', 'field.name', { displayName: 'Name' }),
      custom('field', 'field.passport', {
        displayName: 'Passport',
      }),
      custom('form', 'form.main', {
        fields: ['field.name', 'field.passport'],
      }),
    ];

    expect(keys(resolveEffectivePackageComponents(draft))).not.toContain(
      'field.passport',
    );

    const published = publishCustom(draft);
    const effective = resolveEffectivePackageComponents(published);
    expect(keys(effective)).toEqual(
      expect.arrayContaining(['field.passport', 'form.main']),
    );
    expect(component(effective, 'form.main').metadataJson).toMatchObject({
      fields: ['field.name', 'field.passport'],
    });
  });

  it('publishes a custom View with columns, filters, and sorting', () => {
    const effective = resolveEffectivePackageComponents(
      publishCustom([
        base('field', 'field.status', {}),
        custom('view', 'view.active', {
          columns: ['field.status'],
          filters: [{ fieldLogicalName: 'field.status', value: 'active' }],
          sorting: [{ fieldLogicalName: 'field.status', direction: 'asc' }],
        }),
      ]),
    );

    expect(component(effective, 'view.active').metadataJson).toMatchObject({
      columns: ['field.status'],
      filters: [{ fieldLogicalName: 'field.status', value: 'active' }],
      sorting: [{ fieldLogicalName: 'field.status', direction: 'asc' }],
    });
  });

  it('publishes a custom Form for selector and renderer hydration', () => {
    const effective = resolveEffectivePackageComponents(
      publishCustom([
        base('field', 'field.name', {}),
        custom('form', 'form.compact', {
          tabs: [{ id: 'summary', fields: ['field.name'] }],
        }),
      ]),
    );

    expect(component(effective, 'form.compact').metadataJson).toMatchObject({
      tabs: [{ id: 'summary', fields: ['field.name'] }],
    });
  });

  it('blocks direct editing of Default Package components', () => {
    expect(
      validatePackageLayerEdit({
        packageIsDefault: true,
        packageIsManaged: false,
        componentIsSystem: true,
      }),
    ).toEqual({
      allowed: false,
      reason: 'Default Package components are read-only.',
    });
  });

  it('requires Add Existing before a system component can be customized', () => {
    expect(
      validatePackageLayerEdit({
        packageIsDefault: false,
        packageIsManaged: false,
        componentIsSystem: true,
      }).allowed,
    ).toBe(false);
    expect(
      validatePackageLayerEdit({
        packageIsDefault: false,
        packageIsManaged: false,
        componentIsSystem: true,
        layerAction: 'modify',
        lifecycleState: 'draft',
      }).allowed,
    ).toBe(true);
  });

  it('merges a published Add Existing customization over its base component', () => {
    const baseForm = base('form', 'form.main', {
      title: 'Main',
      layout: { columns: 2, density: 'comfortable' },
    });
    const override = {
      ...custom('form', 'form.main.custom', {
        title: 'Workspace',
        layout: { columns: 3 },
      }),
      baseComponentId: baseForm.objectId,
      lifecycleState: 'published',
      layerAction: 'modify',
    };

    const effective = resolveEffectivePackageComponents([baseForm, override]);
    expect(effective).toHaveLength(1);
    expect(effective[0]?.metadataJson).toEqual({
      title: 'Workspace',
      layout: { columns: 3, density: 'comfortable' },
    });
  });

  it('keeps draft changes isolated and activates them after publish', () => {
    const baseView = base('view', 'view.all', { pageSize: 25 });
    const draftOverride = {
      ...custom('view', 'view.all.custom', { pageSize: 50 }),
      baseComponentId: baseView.objectId,
      layerAction: 'modify',
    };

    expect(
      component(
        resolveEffectivePackageComponents([baseView, draftOverride]),
        'view.all',
      ).metadataJson,
    ).toEqual({ pageSize: 25 });
    expect(
      resolveEffectivePackageComponents([
        baseView,
        { ...draftOverride, lifecycleState: 'published' },
      ])[0]?.metadataJson,
    ).toEqual({ pageSize: 50 });
  });

  it('blocks publish when metadata references a missing dependency', () => {
    const issues = validatePackageComponentDependencies({
      components: [
        {
          id: 'form-1',
          componentType: CustomizationSolutionComponentType.form,
          objectId: 'form-1',
          objectKey: 'form.main',
          isSystem: false,
          isCustom: true,
          metadataJson: {
            fields: [{ fieldLogicalName: 'field.missing' }],
            widgetId: 'widget.missing',
            relationshipName: 'relationship.missing',
            ruleKey: 'rule.missing',
          },
        },
      ],
    });

    expect(issues.filter((issue) => issue.blocking)).toHaveLength(4);
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('field.missing'),
        expect.stringContaining('widget.missing'),
        expect.stringContaining('relationship.missing'),
        expect.stringContaining('rule.missing'),
      ]),
    );
  });

  it('emits tenant, version, package, type, and Module invalidation keys', () => {
    expect(
      buildMetadataInvalidationKeys({
        tenantId: 'tenant-1',
        packageIds: ['package-1'],
        componentTypes: ['form', 'view', 'widget'],
        moduleIds: ['module-1'],
        snapshotVersion: 7,
      }),
    ).toEqual([
      'metadata:tenant-1',
      'metadata:tenant-1:v7',
      'package:package-1',
      'metadata:tenant-1:type:form',
      'metadata:tenant-1:type:view',
      'metadata:tenant-1:type:widget',
      'metadata:tenant-1:module:module-1',
    ]);
  });

  it('keeps draft Rules and Widgets out of effective runtime metadata', () => {
    const layers = [
      custom('rule', 'rule.visible', { expression: 'status == active' }),
      custom('widget', 'widget.summary', { rendererKey: 'summary' }),
    ];
    expect(resolveEffectivePackageComponents(layers)).toEqual([]);
    expect(
      keys(resolveEffectivePackageComponents(publishCustom(layers))),
    ).toEqual(['rule.visible', 'widget.summary']);
  });

  it('uses stable Form/View IDs in public URL state', () => {
    const listPage = webFile(
      'apps/web/app/components/runtime/module-list-page.tsx',
    );
    const recordPage = webFile(
      'apps/web/app/components/runtime/module-record-page.tsx',
    );

    expect(listPage).toContain('searchParams.get("viewId")');
    expect(listPage).toContain('params.set("viewId"');
    expect(listPage).toContain('params.delete("view")');
    expect(recordPage).toContain('searchParams.get("formId")');
    expect(recordPage).toContain('params.set("formId"');
    expect(recordPage).toContain('params.delete("form")');
  });

  it('keeps shared runtime components free of Module-specific names and routes', () => {
    const files = [
      'apps/web/app/components/runtime/module-list-page.tsx',
      'apps/web/app/components/runtime/module-record-page.tsx',
      'apps/web/app/components/runtime/module-widget-renderer.tsx',
      'apps/web/app/components/runtime/module-related-subgrid.tsx',
      'apps/web/app/components/runtime/module-runtime-command-handler.tsx',
      'apps/web/lib/runtime/modules/standard-module-data.adapter.ts',
    ];
    const forbidden = [
      '/employees',
      '/leave-requests',
      'employeeCode',
      'employmentStatus',
      'leave_approval_tracker',
    ];

    for (const file of files) {
      const source = webFile(file);
      for (const value of forbidden) expect(source).not.toContain(value);
    }
  });
});

function base(
  componentType: string,
  objectKey: string,
  metadataJson: Metadata,
): Component {
  return {
    id: `base:${objectKey}`,
    packageId: 'default',
    componentType,
    objectId: `object:${objectKey}`,
    objectKey,
    baseComponentId: null,
    layerAction: 'create',
    lifecycleState: 'published',
    layerOrder: 100,
    metadataJson,
  };
}

function custom(
  componentType: string,
  objectKey: string,
  metadataJson: Metadata,
): Component {
  return {
    id: `custom:${objectKey}`,
    packageId: 'custom',
    componentType,
    objectId: `custom-object:${objectKey}`,
    objectKey,
    baseComponentId: null,
    layerAction: 'create',
    lifecycleState: 'draft',
    layerOrder: 300,
    metadataJson,
  };
}

function publishCustom(components: readonly Component[]) {
  return components.map((item) =>
    item.packageId === 'custom'
      ? { ...item, lifecycleState: 'published' }
      : item,
  );
}

function keys(components: readonly Component[]) {
  return components.map((item) => item.objectKey);
}

function component(components: readonly Component[], objectKey: string) {
  const result = components.find((item) => item.objectKey === objectKey);
  if (!result) throw new Error(`Missing effective component ${objectKey}`);
  return result;
}

function webFile(path: string) {
  return readFileSync(resolve(process.cwd(), '..', '..', path), 'utf8');
}
