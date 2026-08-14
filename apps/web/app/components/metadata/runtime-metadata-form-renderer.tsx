"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RuntimeCustomizationForm } from "@/lib/customization-forms";
import type {
  EntityMetadata,
  FieldMetadata,
  FormFieldMetadata,
  FormMetadata,
  FormComponentMetadata,
  FormSectionMetadata,
  FormTabMetadata,
} from "@/lib/runtime/metadata-runtime.types";
import type { ModuleRuntimeContext } from "@/lib/runtime/module-runtime.types";
import type { ModuleDataAdapter } from "@/lib/runtime/module-data-adapter.types";
import {
  CheckboxField,
  DateField,
  LookupField,
  MultiSelectField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
  TimeField,
  type LookupOption,
} from "@/app/components/ui/form-control";
import { ModuleRelatedSubgrid } from "@/app/components/runtime/module-related-subgrid";
import { ModuleWidgetRenderer } from "@/app/components/runtime/module-widget-renderer";
import { ResponsiveRuntimeTabs } from "@/app/components/runtime/responsive-runtime-tabs";
import { resolveSafeFieldMetadata } from "@/lib/runtime/security-runtime.resolver";
import {
  isVisibleByRules,
  type VisibilityEvaluationContext,
} from "@/lib/runtime/visibility.resolver";
import { formatRuntimeFieldValue } from "@/lib/runtime/runtime-value-formatter";
import {
  columnsFromSectionLayout,
  FormGrid,
  FormGridItem,
  normalizeFormGridColumnCount,
} from "./form-layout-grid";

export type FieldValueMap = Record<
  string,
  | string
  | number
  | boolean
  | readonly string[]
  | readonly Record<string, unknown>[]
  | Record<string, unknown>
  | null
  | undefined
>;

/**
 * What a purpose-built tab body gets to work with.
 *
 * Some records need a control the generic field renderer cannot express — a
 * map, an inheritance switch, a readiness panel. Passing a render function
 * rather than a finished node lets those controls read and write the SAME draft
 * values every other field uses, so the record still has one save flow and one
 * validation pass. A plain ReactNode is still accepted for static panels.
 */
export type RuntimeTabContentContext = {
  readonly values: FieldValueMap;
  readonly mode: "detail" | "edit" | "new";
  readonly fieldErrors: Record<string, readonly string[]>;
  readonly onValuesChange?: (values: FieldValueMap) => void;
};

export type RuntimeTabContent =
  | ReactNode
  | ((context: RuntimeTabContentContext) => ReactNode);

type ValuesChangeDeriver = (input: {
  readonly changedField: FieldMetadata;
  readonly lookupOptions: Record<string, readonly LookupOption[]>;
  readonly nextValues: FieldValueMap;
  readonly previousValues: FieldValueMap;
}) => FieldValueMap;

type FieldEditabilityResolver = (input: {
  readonly defaultEditable: boolean;
  readonly field: FieldMetadata;
  readonly formField: FormFieldMetadata;
  readonly values: FieldValueMap;
}) => boolean;

type CustomizationFormRendererProps = {
  readonly form: RuntimeCustomizationForm;
  readonly values: FieldValueMap;
  readonly entity?: never;
  readonly mode?: never;
};

type RuntimeFormRendererProps = {
  readonly entity: EntityMetadata;
  readonly form: FormMetadata;
  readonly lookupDisplayValues?: Record<string, string>;
  readonly lookupOptions?: Record<string, readonly LookupOption[]>;
  readonly mode: "detail" | "edit" | "new";
  readonly fieldErrors?: Record<string, readonly string[]>;
  readonly touchedFields?: ReadonlySet<string>;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly onValuesChange?: (values: FieldValueMap) => void;
  readonly deriveValuesOnChange?: ValuesChangeDeriver;
  readonly resolveFieldEditable?: FieldEditabilityResolver;
  readonly runtime?: ModuleRuntimeContext;
  readonly values: FieldValueMap;
  readonly tabContent?: Readonly<Record<string, RuntimeTabContent>>;
  readonly sectionContent?: Readonly<Record<string, RuntimeTabContent>>;
};

type RuntimeMetadataFormRendererProps =
  | CustomizationFormRendererProps
  | RuntimeFormRendererProps;

const BLANK_EMPTY_VALUE_MODULES = new Set([
  "settings-countries",
  "settings-states",
  "settings-cities",
  "settings-timezones",
  "settings-currencies",
  "settings-payroll-regions",
  "settings-fiscal-years",
  "settings-tenant",
  "settings-organizations",
  "settings-business-units",
  "settings-departments",
  "settings-users",
]);

export function RuntimeMetadataFormRenderer(
  props: RuntimeMetadataFormRendererProps,
) {
  if (isRuntimeFormRendererProps(props)) {
    return (
      <RuntimeFormMetadataRenderer
        entity={props.entity}
        form={props.form}
        lookupDisplayValues={props.lookupDisplayValues}
        lookupOptions={props.lookupOptions}
        mode={props.mode}
        fieldErrors={props.fieldErrors}
        touchedFields={props.touchedFields}
        dataAdapter={props.dataAdapter}
        onValuesChange={props.onValuesChange}
        deriveValuesOnChange={props.deriveValuesOnChange}
        resolveFieldEditable={props.resolveFieldEditable}
        runtime={props.runtime}
        values={props.values}
        tabContent={props.tabContent}
        sectionContent={props.sectionContent}
      />
    );
  }

  return <CustomizationFormRenderer form={props.form} values={props.values} />;
}

function isRuntimeFormRendererProps(
  props: RuntimeMetadataFormRendererProps,
): props is RuntimeFormRendererProps {
  return Boolean(props.entity);
}

function CustomizationFormRenderer({
  form,
  values,
}: {
  readonly form: RuntimeCustomizationForm;
  readonly values: FieldValueMap;
}) {
  const tabs = form.layoutJson.tabs ?? [];
  if (tabs.length === 0) return null;

  return (
    <article className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
      <FormHeading title={form.name} />
      <div className="grid gap-6">
        {tabs.map((tab) => (
          <section key={tab.id} className="grid gap-4">
            <h4 className="text-base font-semibold text-foreground">
              {tab.label}
            </h4>
            {(tab.sections ?? [])
              .filter((section) => section.isVisible !== false)
              .map((section) => (
                <div
                  className="rounded-2xl border border-border bg-white/80 p-4"
                  key={section.id}
                >
                  {section.labelVisible !== false ? (
                    <p className="mb-3 text-sm font-semibold text-foreground">
                      {section.label}
                    </p>
                  ) : null}
                  <FormGrid columns={section.columns} kind="section">
                    {(section.fields ?? [])
                      .filter((field) => field.isVisible !== false)
                      .map((field) => (
                        <FormGridItem
                          columnSpan={field.columnSpan}
                          key={`${section.id}-${field.columnKey}`}
                          parentColumns={section.columns}
                        >
                          <ReadOnlyField
                            label={field.label ?? field.columnKey}
                            required={field.required}
                            value={values[field.columnKey]}
                          />
                        </FormGridItem>
                      ))}
                  </FormGrid>
                </div>
              ))}
          </section>
        ))}
      </div>
    </article>
  );
}

function RuntimeFormMetadataRenderer({
  entity,
  form,
  lookupDisplayValues = {},
  lookupOptions = {},
  mode,
  dataAdapter,
  fieldErrors = {},
  onValuesChange,
  deriveValuesOnChange,
  resolveFieldEditable,
  runtime,
  tabContent,
  sectionContent,
  touchedFields,
  values,
}: {
  readonly entity: EntityMetadata;
  readonly form: FormMetadata;
  readonly lookupDisplayValues?: Record<string, string>;
  readonly lookupOptions?: Record<string, readonly LookupOption[]>;
  readonly mode: "detail" | "edit" | "new";
  readonly fieldErrors?: Record<string, readonly string[]>;
  readonly touchedFields?: ReadonlySet<string>;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly onValuesChange?: (values: FieldValueMap) => void;
  readonly deriveValuesOnChange?: ValuesChangeDeriver;
  readonly resolveFieldEditable?: FieldEditabilityResolver;
  readonly runtime?: ModuleRuntimeContext;
  readonly values: FieldValueMap;
  readonly tabContent?: Readonly<Record<string, RuntimeTabContent>>;
  readonly sectionContent?: Readonly<Record<string, RuntimeTabContent>>;
}) {
  const fieldsByName = new Map(
    entity.fields.map((field) => [field.logicalName, field]),
  );
  /*
   * Role and permission gating for tabs. Built from the runtime principal so a
   * rule written on a tab behaves exactly as one written on a command.
   */
  const visibilityContext = useMemo<VisibilityEvaluationContext | undefined>(
    () =>
      runtime
        ? {
            principal: {
              roleKeys: runtime.security.principal.roleKeys,
              permissionKeys: runtime.security.principal.permissionKeys,
            },
            record: values,
          }
        : undefined,
    [runtime, values],
  );

  const tabs = resolveFormTabs(form, visibilityContext);
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.tabKey ?? "");
  const [dynamicLookupOptions, setDynamicLookupOptions] = useState<
    Record<string, readonly LookupOption[]>
  >({});
  const [hydratedLookupFields, setHydratedLookupFields] = useState<
    ReadonlySet<string>
  >(() => new Set());
  // Fields whose options could not be loaded (permission denied, network, 5xx).
  // Without this they look identical to a genuinely empty list, and the form
  // told the user to go create a record they simply were not allowed to read.
  const [failedLookupFields, setFailedLookupFields] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const allowedWidgetComponentIds = useMemo(
    () => resolveAllowedWidgetComponentIds(form),
    [form],
  );
  const activeTab =
    tabs.find(
      (tab) => tab.tabKey === activeTabKey && tab.isVisible !== false,
    ) ??
    tabs[0] ??
    null;
  const visibleSections = resolveTabSections(form, activeTab, visibilityContext);
  return (
    <article className="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      {tabs.length > 1 ? (
        <div className="min-w-0 overflow-hidden border-b border-border px-4 pt-4">
          <ResponsiveRuntimeTabs
            activeTabKey={activeTab?.tabKey ?? ""}
            onTabChange={setActiveTabKey}
            tabs={tabs}
          />
        </div>
      ) : null}

      <div className="min-w-0 p-5">
        {activeTab && tabContent?.[activeTab.tabKey] ? (
          renderTabContent(tabContent[activeTab.tabKey], {
            values,
            mode,
            fieldErrors,
            onValuesChange,
          })
        ) : activeTab?.type === "related_module" ? (
          activeTab.subgrid ? (
            <ModuleRelatedSubgrid
              dataAdapter={dataAdapter}
              parentBinding={resolveParentBinding(
                entity,
                activeTab.subgrid.relationshipName,
                runtime?.recordId,
              )}
              parentRecord={values}
              quickCreateForm={resolveQuickCreateForm(
                runtime,
                activeTab.subgrid.relatedEntityLogicalName,
              )}
              runtime={runtime}
              subgrid={activeTab.subgrid}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-warning/40 bg-warning/5 p-4">
              <p className="text-sm font-semibold text-foreground">
                Related Module is not configured
              </p>
              <p className="mt-1 text-sm text-muted">
                This tab needs explicit Relationship and Related List metadata
                before it can render records.
              </p>
            </div>
          )
        ) : (
          <RuntimeSectionColumns
            allowedWidgetComponentIds={allowedWidgetComponentIds}
            columnCount={activeTab?.columns ?? form.columns ?? 1}
            dataAdapter={dataAdapter}
            entity={entity}
            fieldErrors={fieldErrors}
            fieldsByName={fieldsByName}
            lookupDisplayValues={lookupDisplayValues}
            lookupOptions={{ ...lookupOptions, ...dynamicLookupOptions }}
            mode={mode}
            hydratedLookupFields={hydratedLookupFields}
            failedLookupFields={failedLookupFields}
            onLookupOptionsChange={(fieldLogicalName, options) =>
              setDynamicLookupOptions((current) => ({
                ...current,
                [fieldLogicalName]: options,
              }))
            }
            onLookupHydrated={(fieldLogicalName, succeeded = true) => {
              setHydratedLookupFields((current) => {
                if (current.has(fieldLogicalName)) return current;
                return new Set([...current, fieldLogicalName]);
              });
              setFailedLookupFields((current) => {
                const alreadyFailed = current.has(fieldLogicalName);
                if (succeeded === !alreadyFailed) return current;
                const next = new Set(current);
                if (succeeded) next.delete(fieldLogicalName);
                else next.add(fieldLogicalName);
                return next;
              });
            }}
            onValuesChange={onValuesChange}
            deriveValuesOnChange={deriveValuesOnChange}
            resolveFieldEditable={resolveFieldEditable}
            runtime={runtime}
            sectionContent={sectionContent}
            sections={visibleSections}
            touchedFields={touchedFields}
            values={values}
          />
        )}
      </div>
    </article>
  );
}

function renderTabContent(
  content: RuntimeTabContent,
  context: RuntimeTabContentContext,
): ReactNode {
  return typeof content === "function" ? content(context) : content;
}

function RuntimeSectionColumns({
  columnCount,
  sections,
  ...sectionProps
}: {
  readonly columnCount: 1 | 2 | 3 | 4;
  readonly sections: readonly FormSectionMetadata[];
} & Omit<Parameters<typeof RuntimeSection>[0], "section">) {
  const normalizedColumns = normalizeFormGridColumnCount(columnCount);
  const blocks = buildRuntimeSectionLayoutBlocks(sections, normalizedColumns);

  return (
    <div className="grid gap-5">
      {blocks.map((block, blockIndex) =>
        block.type === "full" ? (
          <RuntimeSection
            {...sectionProps}
            key={block.section.id}
            section={block.section}
          />
        ) : (
          <div
            className={`grid items-start gap-5 ${runtimeSectionColumnClass(normalizedColumns)}`}
            key={`section-columns-${blockIndex}`}
          >
            {block.columns.map((columnSections, columnIndex) => (
              <div className="grid gap-5" key={columnIndex}>
                {columnSections.map((section) => (
                  <RuntimeSection
                    {...sectionProps}
                    key={section.id}
                    section={section}
                  />
                ))}
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}

type RuntimeSectionLayoutBlock =
  | { readonly type: "columns"; readonly columns: FormSectionMetadata[][] }
  | { readonly type: "full"; readonly section: FormSectionMetadata };

function buildRuntimeSectionLayoutBlocks(
  sections: readonly FormSectionMetadata[],
  columnCount: 1 | 2 | 3,
): readonly RuntimeSectionLayoutBlock[] {
  if (columnCount === 1 || sections.length <= 1) {
    return sections.map((section) => ({ type: "full", section }) as const);
  }

  const blocks: RuntimeSectionLayoutBlock[] = [];
  let buckets = emptySectionBuckets(columnCount);

  const flushBuckets = () => {
    if (buckets.some((bucket) => bucket.length > 0)) {
      blocks.push({ type: "columns", columns: buckets });
      buckets = emptySectionBuckets(columnCount);
    }
  };

  for (const section of sections) {
    const span = Number(section.columnSpan);
    if (Number.isFinite(span) && span >= columnCount) {
      flushBuckets();
      blocks.push({ type: "full", section });
      continue;
    }

    buckets[shortestSectionBucketIndex(buckets)]?.push(section);
  }

  flushBuckets();
  return blocks;
}

function emptySectionBuckets(columnCount: 1 | 2 | 3) {
  return Array.from({ length: columnCount }, () => [] as FormSectionMetadata[]);
}

function shortestSectionBucketIndex(buckets: readonly FormSectionMetadata[][]) {
  let targetIndex = 0;
  for (let index = 1; index < buckets.length; index += 1) {
    if (buckets[index].length < buckets[targetIndex].length) {
      targetIndex = index;
    }
  }
  return targetIndex;
}

function runtimeSectionColumnClass(columnCount: 1 | 2 | 3) {
  if (columnCount === 3) return "md:grid-cols-3";
  if (columnCount === 2) return "md:grid-cols-2";
  return "grid-cols-1";
}

function warnInvalidLayoutConfiguration(
  scope: string,
  input: {
    readonly columns?: unknown;
    readonly columnSpan?: unknown;
    readonly parentColumns?: unknown;
  },
) {
  if (process.env.NODE_ENV === "production") return;
  const columns = Number(input.columns);
  const span = Number(input.columnSpan);
  const parentColumns = Number(input.parentColumns);
  const issues = [
    input.columns !== undefined &&
    (!Number.isFinite(columns) || columns < 1 || columns > 3)
      ? `columns=${String(input.columns)}`
      : null,
    input.columnSpan !== undefined &&
    (!Number.isFinite(span) || span < 1 || span > 3)
      ? `columnSpan=${String(input.columnSpan)}`
      : null,
    input.columnSpan !== undefined &&
    Number.isFinite(span) &&
    Number.isFinite(parentColumns) &&
    span > parentColumns
      ? `columnSpan exceeds parentColumns=${String(input.parentColumns)}`
      : null,
  ].filter(Boolean);

  if (issues.length) {
    console.warn(
      `[RuntimeMetadataFormRenderer] Normalized invalid layout for ${scope}: ${issues.join(", ")}`,
    );
  }
}

function resolveQuickCreateForm(
  runtime: ModuleRuntimeContext | undefined,
  relatedEntityLogicalName: string | undefined,
) {
  if (!runtime || !relatedEntityLogicalName) return null;

  return (
    runtime.metadata.forms.find(
      (form) =>
        form.formType === "quickCreate" &&
        form.entityLogicalName === relatedEntityLogicalName,
    ) ?? null
  );
}

function isFormFieldVisible(
  formField: FormFieldMetadata,
  values: FieldValueMap,
) {
  if (formField.visibilityRuleKey === "attendance.hideWorkSiteOnRemote") {
    return values.attendanceMode !== "REMOTE";
  }

  return true;
}

function resolveParentBinding(
  entity: EntityMetadata,
  relationshipName: string,
  recordId: string | undefined,
) {
  if (!recordId) return undefined;
  const relationship = entity.relationships?.find(
    (item) => item.relationshipName === relationshipName,
  );
  const fieldLogicalName = relationship?.targetFieldLogicalName;

  return fieldLogicalName
    ? {
        fieldLogicalName,
        recordId,
      }
    : undefined;
}

function resolveFormTabs(
  form: FormMetadata,
  visibility?: VisibilityEvaluationContext,
): readonly FormTabMetadata[] {
  const explicitTabs = (form.tabs ?? [])
    .filter((tab) => tab.isVisible !== false)
    .filter((tab) => !visibility || isVisibleByRules(tab, visibility))
    .sort((left, right) => left.order - right.order);

  if (explicitTabs.length) return explicitTabs;

  return [
    {
      id: `${form.id}-main-tab`,
      tabKey: "summary",
      label: form.displayName,
      order: 10,
      type: "fields",
      sectionIds: form.sections.map((section) => section.id),
    },
  ];
}

function resolveTabSections(
  form: FormMetadata,
  activeTab: FormTabMetadata | null,
  visibility?: VisibilityEvaluationContext,
) {
  const visible = (sections: readonly FormSectionMetadata[]) =>
    visibility
      ? sections.filter((section) => isVisibleByRules(section, visibility))
      : sections;

  if (!activeTab) return visible(form.sections);

  const sectionIds = new Set(activeTab.sectionIds ?? []);

  return visible(form.sections)
    .filter((section) =>
      section.tabKey
        ? section.tabKey === activeTab.tabKey
        : sectionIds.size === 0 || sectionIds.has(section.id),
    )
    .sort((left, right) => left.order - right.order);
}

function RuntimeSection({
  dataAdapter,
  entity,
  fieldsByName,
  lookupDisplayValues,
  lookupOptions,
  mode,
  hydratedLookupFields,
  failedLookupFields,
  fieldErrors,
  onLookupOptionsChange,
  onLookupHydrated,
  onValuesChange,
  deriveValuesOnChange,
  resolveFieldEditable,
  runtime,
  section,
  sectionContent,
  allowedWidgetComponentIds,
  touchedFields,
  values,
}: {
  readonly dataAdapter?: ModuleDataAdapter;
  readonly entity: EntityMetadata;
  readonly fieldsByName: ReadonlyMap<string, FieldMetadata>;
  readonly lookupDisplayValues: Record<string, string>;
  readonly lookupOptions: Record<string, readonly LookupOption[]>;
  readonly mode: "detail" | "edit" | "new";
  readonly hydratedLookupFields: ReadonlySet<string>;
  readonly failedLookupFields?: ReadonlySet<string>;
  readonly fieldErrors: Record<string, readonly string[]>;
  readonly onLookupOptionsChange?: (
    fieldLogicalName: string,
    options: readonly LookupOption[],
  ) => void;
  readonly onLookupHydrated?: (
    fieldLogicalName: string,
    succeeded?: boolean,
  ) => void;
  readonly onValuesChange?: (values: FieldValueMap) => void;
  readonly deriveValuesOnChange?: ValuesChangeDeriver;
  readonly resolveFieldEditable?: FieldEditabilityResolver;
  readonly runtime?: ModuleRuntimeContext;
  readonly section: FormSectionMetadata;
  readonly sectionContent?: Readonly<Record<string, RuntimeTabContent>>;
  readonly allowedWidgetComponentIds: ReadonlySet<string>;
  readonly touchedFields?: ReadonlySet<string>;
  readonly values: FieldValueMap;
}) {
  const sectionColumns = normalizeFormGridColumnCount(
    section.columns ?? columnsFromSectionLayout(section.layout),
  );
  warnInvalidLayoutConfiguration(`section:${section.id}`, {
    columns: section.columns,
    columnSpan: section.columnSpan,
  });
  const visibleFields = section.fields.filter((field) => {
    if (field.isVisible === false || !isFormFieldVisible(field, values)) {
      return false;
    }
    const metadataField = fieldsByName.get(field.fieldLogicalName);
    if (!metadataField) return false;
    if (
      shouldHideEmptyReadonlyCreateField({
        field: metadataField,
        formField: field,
        mode,
        runtime,
        values,
      })
    ) {
      return false;
    }
    return runtime
      ? resolveSafeFieldMetadata(runtime.security, metadataField).canRead
      : true;
  });
  const visibleComponents = (section.components ?? []).filter(
    (component) =>
      component.isVisible !== false &&
      (!component.lifecycleState || component.lifecycleState === "published") &&
      (component.type !== "widget" ||
        allowedWidgetComponentIds.has(component.id)),
  );
  const lookupHydrationKey = visibleFields
    .map((formField) => fieldsByName.get(formField.fieldLogicalName))
    .filter(
      (field): field is FieldMetadata =>
        field !== undefined && field.dataType === "lookup",
    )
    .map((field) =>
      [
        field.logicalName,
        field.dependsOnFieldId
          ? String(values[field.dependsOnFieldId] ?? "")
          : "",
      ].join(":"),
    )
    .join("|");

  useEffect(() => {
    const getLookupOptions = dataAdapter?.getLookupOptions;
    if (!getLookupOptions || !runtime) {
      return;
    }
    const currentRuntime = runtime;
    const loadLookupOptions: NonNullable<
      ModuleDataAdapter["getLookupOptions"]
    > = getLookupOptions;

    const fieldsToHydrate = visibleFields
      .map((formField) => fieldsByName.get(formField.fieldLogicalName))
      .filter(
        (field): field is FieldMetadata =>
          field !== undefined &&
          field.dataType === "lookup" &&
          (mode !== "detail" ||
            !resolveLookupDisplayValue(
              field,
              values[field.logicalName],
              values,
              lookupDisplayValues,
              lookupOptions,
            )) &&
          !lookupOptions[field.logicalName]?.length &&
          !hydratedLookupFields.has(field.logicalName),
      );

    if (fieldsToHydrate.length === 0) return;

    let cancelled = false;

    async function hydrateLookupFields() {
      await Promise.all(
        fieldsToHydrate.map(async (field) => {
          let succeeded = false;
          try {
            const options = await loadLookupOptions(
              currentRuntime,
              field,
              values,
            );
            if (cancelled) return;
            succeeded = true;
            onLookupOptionsChange?.(
              field.logicalName,
              options.map((option) => ({
                id: option.id,
                name: option.name,
                key: option.key,
                code: option.code,
                employeeLevelId: option.employeeLevelId,
                subtitle: option.subtitle,
              })),
            );
          } catch (error) {
            console.error("Runtime lookup hydration failed", {
              field: field.logicalName,
              message: error instanceof Error ? error.message : String(error),
              data:
                error instanceof Error && "data" in error
                  ? (error as Error & { data?: unknown }).data
                  : undefined,
            });
          } finally {
            if (!cancelled) {
              onLookupHydrated?.(field.logicalName, succeeded);
            }
          }
        }),
      );
    }

    void hydrateLookupFields();

    return () => {
      cancelled = true;
    };
  }, [
    dataAdapter,
    fieldsByName,
    hydratedLookupFields,
    lookupHydrationKey,
    lookupDisplayValues,
    lookupOptions,
    mode,
    onLookupHydrated,
    onLookupOptionsChange,
    runtime,
    values,
    visibleFields,
  ]);

  /*
   * A section the caller renders itself. Used where a control cannot be
   * expressed as a grid of fields — a map, an inheritance switch — while the
   * rest of the form stays metadata driven. It receives the same draft values
   * and change handler, so the record keeps ONE save flow.
   */
  const customContent = sectionContent?.[section.id];
  if (customContent !== undefined) {
    return (
      <section className="grid gap-4">
        {section.label ? (
          <h4 className="text-base font-semibold text-foreground">
            {section.label}
          </h4>
        ) : null}
        {renderTabContent(customContent, {
          values,
          mode,
          fieldErrors,
          onValuesChange,
        })}
      </section>
    );
  }

  if (visibleFields.length === 0 && visibleComponents.length === 0) return null;

  return (
    <section className="grid gap-4">
      <h4 className="text-base font-semibold text-foreground">
        {section.label}
      </h4>
      <div className="rounded-2xl border border-border bg-white/80 p-4">
        <FormGrid columns={sectionColumns} kind="section">
          {visibleFields.map((formField) => {
            const field = fieldsByName.get(formField.fieldLogicalName);
            if (!field) return null;
            warnInvalidLayoutConfiguration(
              `field:${section.id}.${formField.fieldLogicalName}`,
              {
                columnSpan: formField.columnSpan,
                parentColumns: sectionColumns,
              },
            );

            const fieldEditable = isEditableRuntimeField({
              field,
              formField,
              mode,
              runtime,
            });
            const resolvedFieldEditable = resolveFieldEditable
              ? resolveFieldEditable({
                  defaultEditable: fieldEditable,
                  field,
                  formField,
                  values,
                })
              : fieldEditable;

            const fieldAccess = runtime
              ? resolveSafeFieldMetadata(runtime.security, field)
              : null;
            const rawValue = values[field.logicalName];
            const displayValue = readOnlyExternalLink(rawValue)
              ? rawValue
              : formatRuntimeFieldValue({
                  field,
                  lookupDisplayValue:
                    resolveLookupDisplayValue(
                      field,
                      rawValue,
                      values,
                      lookupDisplayValues,
                      lookupOptions,
                    ) ?? lookupDisplayValues[field.logicalName],
                  record: values,
                  tenant: runtime?.tenant,
                  value: rawValue,
                });
            const securedDisplayValue =
              fieldAccess?.isMasked && displayValue
                ? maskRuntimeFieldValue(
                    displayValue,
                    fieldAccess.maskingPattern,
                    fieldAccess.customMask,
                  )
                : displayValue;
            const readOnlyValue =
              runtime?.module.key &&
              BLANK_EMPTY_VALUE_MODULES.has(runtime.module.key) &&
              securedDisplayValue === "Not set"
                ? ""
                : securedDisplayValue;
            const fieldColumnSpan = runtimeFieldColumnSpan(
              field,
              formField,
              sectionColumns,
            );

            return !resolvedFieldEditable ? (
              <FormGridItem
                columnSpan={fieldColumnSpan}
                dataRuntimeField={field.logicalName}
                key={`${section.id}-${formField.fieldLogicalName}`}
                parentColumns={sectionColumns}
              >
                <ReadOnlyField
                  field={field}
                  label={formField.label ?? field.displayName}
                  required={
                    (formField.requirementLevel ?? field.requirementLevel) ===
                    "required"
                  }
                  error={firstError(fieldErrors[field.logicalName])}
                  touched={touchedFields?.has(field.logicalName)}
                  value={readOnlyValue}
                />
              </FormGridItem>
            ) : (
              <FormGridItem
                columnSpan={fieldColumnSpan}
                dataRuntimeField={field.logicalName}
                key={`${section.id}-${formField.fieldLogicalName}`}
                parentColumns={sectionColumns}
              >
                <EditableField
                  allLookupOptions={lookupOptions}
                  dataAdapter={dataAdapter}
                  field={field}
                  label={formField.label ?? field.displayName}
                  lookupDisplayValues={lookupDisplayValues}
                  lookupOptions={lookupOptions[field.logicalName] ?? []}
                  lookupOptionsHydrated={
                    hydratedLookupFields.has(field.logicalName) ||
                    Boolean(lookupOptions[field.logicalName]?.length) ||
                    !dataAdapter?.getLookupOptions
                  }
                  lookupOptionsFailed={Boolean(
                    failedLookupFields?.has(field.logicalName),
                  )}
                  error={firstError(fieldErrors[field.logicalName])}
                  onValueChange={(value) => {
                    const nextValues = applyFieldValueChange({
                      changedField: field,
                      entity,
                      value,
                      values,
                    });
                    const resolvedNextValues =
                      deriveValuesOnChange?.({
                        changedField: field,
                        lookupOptions,
                        nextValues,
                        previousValues: values,
                      }) ?? nextValues;
                    onValuesChange?.(resolvedNextValues);
                    void loadDependentLookupOptions({
                      changedField: field,
                      dataAdapter,
                      entity,
                      nextValues: resolvedNextValues,
                      onLookupOptionsChange,
                      runtime,
                    });
                  }}
                  required={
                    (formField.requirementLevel ?? field.requirementLevel) ===
                    "required"
                  }
                  runtime={runtime}
                  touched={touchedFields?.has(field.logicalName)}
                  value={values[field.logicalName]}
                  values={values}
                />
              </FormGridItem>
            );
          })}
          {visibleComponents.map((component) => (
            <RuntimeComponent
              component={component}
              key={component.id}
              dataAdapter={dataAdapter}
              runtime={runtime}
              sectionColumns={sectionColumns}
            />
          ))}
        </FormGrid>
      </div>
    </section>
  );
}

function runtimeFieldColumnSpan(
  field: FieldMetadata,
  formField: FormFieldMetadata,
  sectionColumns: 1 | 2 | 3,
) {
  if (FULL_WIDTH_RUNTIME_FIELDS.has(field.logicalName)) {
    return sectionColumns;
  }

  return formField.columnSpan;
}

const FULL_WIDTH_RUNTIME_FIELDS = new Set(["eligibilityRules"]);
const HIDDEN_EMPTY_CREATE_FIELDS_BY_MODULE: Record<
  string,
  ReadonlySet<string>
> = {
  "payroll-runs": new Set([
    "periodName",
    "payrollCycleName",
    "payrollCalendarName",
    "payrollRegionName",
    "runNumber",
    "status",
    "calculatedAt",
    "lockedAt",
  ]),
};

function resolveAllowedWidgetComponentIds(form: FormMetadata) {
  const allowed = new Set<string>();
  const limitedWidgetTypes = new Set(["timeline", "reporting_hierarchy"]);
  const seenLimitedTypes = new Set<string>();
  const orderedSections = [...form.sections].sort(
    (left, right) => left.order - right.order,
  );

  for (const section of orderedSections) {
    const components = [...(section.components ?? [])].sort(
      (left, right) => left.order - right.order,
    );
    for (const component of components) {
      if (component.type !== "widget" || !component.widgetType) continue;
      if (
        component.lifecycleState &&
        component.lifecycleState !== "published"
      ) {
        continue;
      }
      if (
        limitedWidgetTypes.has(component.widgetType) &&
        seenLimitedTypes.has(component.widgetType)
      ) {
        continue;
      }
      allowed.add(component.id);
      if (limitedWidgetTypes.has(component.widgetType)) {
        seenLimitedTypes.add(component.widgetType);
      }
    }
  }

  return allowed;
}

function RuntimeComponent({
  component,
  dataAdapter,
  runtime,
  sectionColumns,
}: {
  readonly component: FormComponentMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly runtime?: ModuleRuntimeContext;
  readonly sectionColumns: 1 | 2 | 3;
}) {
  warnInvalidLayoutConfiguration(`component:${component.id}`, {
    columnSpan: component.columnSpan,
    parentColumns: sectionColumns,
  });

  if (component.type === "notes") {
    return (
      <FormGridItem
        className="rounded-lg border border-dashed border-border p-4 text-sm text-muted"
        columnSpan={component.columnSpan}
        parentColumns={sectionColumns}
      >
        Notes will appear here when reusable note storage is connected.
      </FormGridItem>
    );
  }

  if (component.type === "relatedList") {
    return (
      <FormGridItem
        className="rounded-lg border border-dashed border-border p-4 text-sm text-muted"
        columnSpan={component.columnSpan}
        parentColumns={sectionColumns}
      >
        Related List metadata is present. Connect a related data adapter to show
        records.
      </FormGridItem>
    );
  }

  if (component.type === "widget" && component.widgetType) {
    return (
      <FormGridItem
        columnSpan={component.columnSpan}
        dataRuntimeWidget={component.id}
        parentColumns={sectionColumns}
      >
        <ModuleWidgetRenderer
          component={component}
          dataAdapter={dataAdapter}
          runtime={runtime}
        />
      </FormGridItem>
    );
  }

  return null;
}

function EditableField({
  dataAdapter,
  field,
  label,
  lookupDisplayValues,
  lookupOptions,
  lookupOptionsHydrated,
  lookupOptionsFailed,
  allLookupOptions,
  error,
  onValueChange,
  required,
  runtime,
  touched,
  value,
  values,
}: {
  readonly dataAdapter?: ModuleDataAdapter;
  readonly field: FieldMetadata;
  readonly label: string;
  readonly lookupDisplayValues: Record<string, string>;
  readonly lookupOptions: readonly LookupOption[];
  readonly lookupOptionsHydrated: boolean;
  readonly lookupOptionsFailed?: boolean;
  readonly allLookupOptions: Record<string, readonly LookupOption[]>;
  readonly error?: string;
  readonly onValueChange?: (value: FieldValueMap[string]) => void;
  readonly required?: boolean;
  readonly runtime?: ModuleRuntimeContext;
  readonly touched?: boolean;
  readonly value: FieldValueMap[string];
  readonly values: FieldValueMap;
}) {
  const fieldValue = value === null || value === undefined ? "" : String(value);
  const checked = Boolean(value);
  const numberValue = numericFieldValue(value);
  const resolvedLookupOptions = ensureSelectedLookupOption({
    field,
    lookupDisplayValues,
    lookupOptions,
    allLookupOptions,
    value,
    values,
  });
  const lookupOptionsMissing =
    field.dataType === "lookup" &&
    lookupOptionsHydrated &&
    resolvedLookupOptions.length === 0;
  const lookupEmptyMessage = lookupOptionsMissing
    ? lookupOptionsFailed
      ? unavailableLookupOptionsMessage(label)
      : emptyLookupOptionsMessage(label)
    : undefined;

  return (
    <div>
      <dd>
        {field.dataType === "optionset" && field.options?.length ? (
          <SelectField
            label={label}
            error={error}
            onChange={(nextValue) => {
              onValueChange?.(nextValue);
            }}
            options={field.options}
            required={required}
            touched={touched}
            value={fieldValue}
          />
        ) : field.dataType === "multi-optionset" && field.options?.length ? (
          <MultiSelectField
            label={label}
            error={error}
            onChange={(nextValue) => onValueChange?.(nextValue)}
            options={field.options}
            value={Array.isArray(value) ? [...value] : []}
          />
        ) : field.dataType === "lookup" ? (
          <LookupField
            label={label}
            error={error}
            onChange={(nextValue) => {
              onValueChange?.(nextValue);
            }}
            noResultsText={lookupEmptyMessage}
            options={[...resolvedLookupOptions]}
            placeholder="Select record"
            required={required}
            selectedHref={lookupReferenceHref(
              field,
              fieldValue,
              resolvedLookupOptions,
            )}
            touched={touched}
            value={fieldValue}
            warning={lookupEmptyMessage}
          />
        ) : field.dataType === "date" ? (
          <DateField
            label={label}
            error={error}
            max={field.maxDate}
            min={field.minDate}
            onChange={(nextValue) => {
              onValueChange?.(nextValue);
            }}
            required={required}
            touched={touched}
            value={fieldValue}
          />
        ) : field.dataType === "time" ? (
          <TimeField
            label={label}
            error={error}
            onChange={(nextValue) => onValueChange?.(nextValue)}
            required={required}
            touched={touched}
            value={fieldValue}
          />
        ) : field.dataType === "boolean" ? (
          <CheckboxField
            checked={checked}
            error={error}
            label={label}
            onChange={(nextValue) => {
              onValueChange?.(nextValue);
            }}
          />
        ) : field.dataType === "number" ||
          field.dataType === "decimal" ||
          field.dataType === "currency" ? (
          <NumberField
            label={label}
            error={error}
            onChange={(nextValue) => {
              onValueChange?.(nextValue ?? null);
            }}
            required={required}
            touched={touched}
            value={numberValue}
          />
        ) : field.logicalName === "eligibilityRules" ? (
          <EligibilityRulesField
            error={error}
            onChange={(nextValue) => onValueChange?.(nextValue)}
            touched={touched}
            value={value}
          />
        ) : field.dataType === "multiline-string" ||
          field.dataType === "json" ? (
          <TextAreaField
            label={label}
            error={error}
            onChange={(nextValue) => {
              if (field.dataType !== "json") {
                onValueChange?.(nextValue);
                return;
              }
              try {
                onValueChange?.(nextValue.trim() ? JSON.parse(nextValue) : {});
              } catch {
                onValueChange?.(nextValue);
              }
            }}
            required={required}
            touched={touched}
            value={
              field.dataType === "json" && typeof value !== "string"
                ? JSON.stringify(value ?? {}, null, 2)
                : fieldValue
            }
          />
        ) : (
          <TextField
            label={label}
            error={error}
            onChange={(nextValue) => {
              onValueChange?.(nextValue);
            }}
            required={required}
            touched={touched}
            type={inputTypeForField(field)}
            value={fieldValue}
          />
        )}
      </dd>
    </div>
  );
}

function emptyLookupOptionsMessage(label: string) {
  const normalizedLabel = label.trim().toLowerCase();
  if (!normalizedLabel) {
    return "No related records are available yet. Create the related record first, then try again.";
  }

  return `No ${normalizedLabel} records are available yet. Create one first, then try again.`;
}

/**
 * Shown when the option request failed rather than returned nothing. Telling
 * someone to "create one first" is wrong and unactionable when the real cause
 * is a denied permission or a failed request.
 */
function unavailableLookupOptionsMessage(label: string) {
  const normalizedLabel = label.trim().toLowerCase();
  const subject = normalizedLabel ? `${normalizedLabel} options` : "options";

  return `Could not load ${subject}. You may not have permission to view these records, or the request failed. Contact your administrator if this continues.`;
}

type EligibilityRuleCondition = {
  attribute: string;
  operator: string;
  values: string[];
};

type EligibilityRuleDraft = {
  id?: string;
  name?: string | null;
  matchType: "ALL" | "ANY";
  priority: number;
  conditions: {
    conditions: EligibilityRuleCondition[];
  };
  isActive: boolean;
};

const eligibilityScopeOptions = [
  { value: "employeeId", label: "Employee" },
  { value: "employeeLevelId", label: "Employee Level" },
  { value: "designationId", label: "Designation" },
  { value: "teamId", label: "Team" },
  { value: "departmentId", label: "Department" },
  { value: "businessUnitId", label: "Business Unit" },
  { value: "organizationId", label: "Organization" },
] as const;

const eligibilityOperatorOptions = [
  { value: "EQUALS", label: "Equals" },
  { value: "NOT_EQUALS", label: "Does Not Equal" },
  { value: "IS_ONE_OF", label: "Is One Of" },
  { value: "IS_NOT_ONE_OF", label: "Is Not One Of" },
  { value: "IS_EMPTY", label: "Is Empty" },
  { value: "IS_NOT_EMPTY", label: "Is Not Empty" },
] as const;

function EligibilityRulesField({
  error,
  onChange,
  touched,
  value,
}: {
  readonly error?: string;
  readonly onChange?: (value: FieldValueMap[string]) => void;
  readonly touched?: boolean;
  readonly value: FieldValueMap[string];
}) {
  const rules = useMemo(() => normalizeEligibilityRules(value), [value]);
  const showError = touched && error;
  const [lookupOptionsByScope, setLookupOptionsByScope] = useState<
    Record<string, readonly LookupOption[]>
  >({});
  const activeLookupScopes = useMemo(
    () =>
      Array.from(
        new Set(
          rules.flatMap((rule) =>
            rule.conditions.conditions.map((condition) => condition.attribute),
          ),
        ),
      ).filter((scope) => eligibilityLookupField(scope) !== null),
    [rules],
  );
  const activeLookupScopeKey = activeLookupScopes.join("|");

  useEffect(() => {
    if (activeLookupScopes.length === 0) {
      return;
    }

    let cancelled = false;

    async function loadEligibilityLookupOptions() {
      const entries: Array<readonly [string, readonly LookupOption[]]> = [];
      const loadedEntries = await Promise.all(
        activeLookupScopes.map(async (scope) => {
          const options = await loadEligibilityLookupScopeOptions(scope).catch(
            () => [],
          );
          return [scope, options] as const;
        }),
      );
      for (const entry of loadedEntries) {
        if (entry) entries.push(entry);
      }

      if (cancelled) return;
      setLookupOptionsByScope((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter(Boolean)),
      }));
    }

    void loadEligibilityLookupOptions();

    return () => {
      cancelled = true;
    };
  }, [activeLookupScopeKey, activeLookupScopes]);

  const updateRules = (nextRules: readonly EligibilityRuleDraft[]) => {
    onChange?.(nextRules.map(serializeEligibilityRule));
  };

  const addRule = () => {
    updateRules([
      ...rules,
      {
        name: "",
        matchType: "ALL",
        priority: rules.length + 1,
        conditions: {
          conditions: [emptyEligibilityCondition()],
        },
        isActive: true,
      },
    ]);
  };

  const updateRule = (
    index: number,
    updater: (rule: EligibilityRuleDraft) => EligibilityRuleDraft,
  ) => {
    updateRules(
      rules.map((rule, itemIndex) =>
        itemIndex === index ? updater(rule) : rule,
      ),
    );
  };

  const removeRule = (index: number) => {
    updateRules(rules.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Eligibility Rules
          </p>
          <p className="text-xs text-muted">
            Match employees by scope, operator, and value.
          </p>
        </div>
        <button
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/10"
          onClick={addRule}
          type="button"
        >
          Add Rule
        </button>
      </div>
      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
          No matching rules configured. Add a rule when Applies To is set to
          Matching Employees.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, ruleIndex) => (
            <div
              className="min-w-0 space-y-3 overflow-hidden rounded-md border border-border bg-surface p-3"
              key={rule.id ?? ruleIndex}
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_minmax(150px,180px)_minmax(110px,140px)_auto]">
                <label className="min-w-0 space-y-1 text-sm">
                  <span className="font-medium text-foreground">Rule Name</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    onChange={(event) =>
                      updateRule(ruleIndex, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Managers"
                    value={rule.name ?? ""}
                  />
                </label>
                <label className="min-w-0 space-y-1 text-sm">
                  <span className="font-medium text-foreground">Match</span>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    onChange={(event) =>
                      updateRule(ruleIndex, (current) => ({
                        ...current,
                        matchType: event.target.value === "ANY" ? "ANY" : "ALL",
                      }))
                    }
                    value={rule.matchType}
                  >
                    <option value="ALL">All Conditions</option>
                    <option value="ANY">Any Condition</option>
                  </select>
                </label>
                <label className="min-w-0 space-y-1 text-sm">
                  <span className="font-medium text-foreground">Priority</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    min={1}
                    onChange={(event) =>
                      updateRule(ruleIndex, (current) => ({
                        ...current,
                        priority: Number(event.target.value) || 1,
                      }))
                    }
                    type="number"
                    value={rule.priority}
                  />
                </label>
                <div className="flex min-w-0 items-end">
                  <button
                    className="h-10 whitespace-nowrap rounded-md border border-danger/40 px-3 text-sm font-medium text-danger transition hover:bg-danger/5"
                    onClick={() => removeRule(ruleIndex)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {rule.conditions.conditions.map((condition, conditionIndex) => (
                  <div
                    className="grid gap-2 lg:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(180px,2fr)_auto]"
                    key={conditionIndex}
                  >
                    <select
                      aria-label="Scope"
                      className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      onChange={(event) =>
                        updateRule(ruleIndex, (current) =>
                          updateEligibilityCondition(current, conditionIndex, {
                            attribute: event.target.value,
                            values: [],
                          }),
                        )
                      }
                      value={condition.attribute}
                    >
                      {eligibilityScopeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Operator"
                      className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                      onChange={(event) =>
                        updateRule(ruleIndex, (current) =>
                          updateEligibilityCondition(current, conditionIndex, {
                            operator: event.target.value,
                            values: eligibilityOperatorNeedsValue(
                              event.target.value,
                            )
                              ? condition.values
                              : [],
                          }),
                        )
                      }
                      value={condition.operator}
                    >
                      {eligibilityOperatorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <EligibilityConditionValueLookup
                      condition={condition}
                      onChange={(nextValues) =>
                        updateRule(ruleIndex, (current) =>
                          updateEligibilityCondition(current, conditionIndex, {
                            values: [...nextValues],
                          }),
                        )
                      }
                      options={lookupOptionsByScope[condition.attribute] ?? []}
                    />
                    <button
                      className="h-10 whitespace-nowrap rounded-md border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted/10"
                      onClick={() =>
                        updateRule(ruleIndex, (current) => ({
                          ...current,
                          conditions: {
                            conditions: current.conditions.conditions.filter(
                              (_, itemIndex) => itemIndex !== conditionIndex,
                            ),
                          },
                        }))
                      }
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                ))}
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted/10"
                  onClick={() =>
                    updateRule(ruleIndex, (current) => ({
                      ...current,
                      conditions: {
                        conditions: [
                          ...current.conditions.conditions,
                          emptyEligibilityCondition(),
                        ],
                      },
                    }))
                  }
                  type="button"
                >
                  Add Condition
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showError ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function EligibilityConditionValueLookup({
  condition,
  onChange,
  options,
}: {
  readonly condition: EligibilityRuleCondition;
  readonly onChange: (values: readonly string[]) => void;
  readonly options: readonly LookupOption[];
}) {
  const disabled = !eligibilityOperatorNeedsValue(condition.operator);
  const selectedValue = disabled ? "" : (condition.values[0] ?? "");
  const scopeLabel = eligibilityScopeLabel(condition.attribute);

  return (
    <LookupField
      className="min-w-0 [&>span:first-child]:sr-only"
      disabled={disabled}
      label="Value"
      noResultsText={`No ${scopeLabel.toLowerCase()} records found.`}
      onChange={(nextValue) => onChange(nextValue ? [nextValue] : [])}
      options={[...options]}
      placeholder={`Select ${scopeLabel.toLowerCase()}`}
      value={selectedValue}
    />
  );
}

function eligibilityOperatorNeedsValue(operator: string) {
  return operator !== "IS_EMPTY" && operator !== "IS_NOT_EMPTY";
}

function eligibilityScopeLabel(scope: string) {
  return (
    eligibilityScopeOptions.find((option) => option.value === scope)?.label ??
    "record"
  );
}

function eligibilityLookupField(scope: string): FieldMetadata | null {
  const config = ELIGIBILITY_LOOKUP_FIELDS[scope];
  if (!config) return null;

  return {
    id: `eligibility.${scope}`,
    logicalName: scope,
    displayName: config.label,
    entityLogicalName: "payComponent",
    version: "1.0.0",
    lifecycleState: "published",
    layer: "system",
    dataType: "lookup",
    requirementLevel: "none",
    behavior: "normal",
    lookupTargets: [
      {
        entityLogicalName: config.entityLogicalName,
      },
    ],
  };
}

async function loadEligibilityLookupScopeOptions(scope: string) {
  const config = ELIGIBILITY_LOOKUP_FIELDS[scope];
  if (!config) return [];

  const data = await requestRuntimeJson(config.path, config.fallbackPath);
  return readRuntimeRecordList(data).flatMap((record) => {
    const id = stringValue(record.id) || stringValue(record.value);
    const name = lookupRecordName(record, config.label);
    if (!id || !name) return [];
    return [
      {
        id,
        name,
        code: stringValue(record.code) || null,
        key: id,
        subtitle: lookupRecordSubtitle(record),
      },
    ];
  });
}

async function requestRuntimeJson(path: string, fallbackPath?: string) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok && fallbackPath && response.status === 400) {
    return requestRuntimeJson(fallbackPath);
  }
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

function readRuntimeRecordList(
  data: unknown,
): readonly Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];

  for (const key of ["items", "records", "data", "results"]) {
    const value = data[key];
    if (Array.isArray(value)) return value.filter(isRecord);
  }

  return [];
}

function lookupRecordName(
  record: Record<string, unknown>,
  fallbackLabel: string,
) {
  return (
    stringValue(record.name) ||
    stringValue(record.fullName) ||
    stringValue(record.displayName) ||
    stringValue(record.label) ||
    [stringValue(record.firstName), stringValue(record.lastName)]
      .filter(Boolean)
      .join(" ") ||
    stringValue(record.title) ||
    stringValue(record.value) ||
    fallbackLabel
  );
}

function lookupRecordSubtitle(record: Record<string, unknown>) {
  return (
    stringValue(record.subtitle) ||
    stringValue(record.workEmail) ||
    stringValue(record.email) ||
    stringValue(record.code) ||
    null
  );
}

const ELIGIBILITY_LOOKUP_FIELDS: Readonly<
  Record<
    string,
    {
      readonly entityLogicalName: string;
      readonly fallbackPath: string;
      readonly label: string;
      readonly path: string;
    }
  >
> = {
  businessUnitId: {
    entityLogicalName: "businessUnit",
    fallbackPath: "/api/business-units",
    label: "Business Unit",
    path: "/api/business-units?isActive=true&pageSize=100",
  },
  departmentId: {
    entityLogicalName: "department",
    fallbackPath: "/api/departments",
    label: "Department",
    path: "/api/departments?isActive=true&pageSize=100",
  },
  designationId: {
    entityLogicalName: "designation",
    fallbackPath: "/api/designations",
    label: "Designation",
    path: "/api/designations?isActive=true&pageSize=100",
  },
  employeeId: {
    entityLogicalName: "employee",
    fallbackPath: "/api/employees",
    label: "Employee",
    path: "/api/employees?pageSize=100",
  },
  employeeLevelId: {
    entityLogicalName: "employeeLevel",
    fallbackPath: "/api/employee-levels",
    label: "Employee Level",
    path: "/api/employee-levels?isActive=true&pageSize=100",
  },
  organizationId: {
    entityLogicalName: "organization",
    fallbackPath: "/api/organizations",
    label: "Organization",
    path: "/api/organizations?isActive=true&pageSize=100",
  },
  teamId: {
    entityLogicalName: "team",
    fallbackPath: "/api/teams",
    label: "Team",
    path: "/api/teams?isActive=true&pageSize=100",
  },
};

function emptyEligibilityCondition(): EligibilityRuleCondition {
  return {
    attribute: "employeeId",
    operator: "EQUALS",
    values: [],
  };
}

function normalizeEligibilityRules(
  value: unknown,
): readonly EligibilityRuleDraft[] {
  const rawRules = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { rules?: unknown }).rules)
      ? (value as { rules: unknown[] }).rules
      : [];
  return rawRules.map((rawRule, index) => {
    const rule =
      rawRule && typeof rawRule === "object"
        ? (rawRule as Record<string, unknown>)
        : {};
    return {
      id: typeof rule.id === "string" ? rule.id : undefined,
      name: typeof rule.name === "string" ? rule.name : "",
      matchType: rule.matchType === "ANY" ? "ANY" : "ALL",
      priority: typeof rule.priority === "number" ? rule.priority : index + 1,
      conditions: {
        conditions: normalizeEligibilityConditions(rule.conditions),
      },
      isActive: rule.isActive !== false,
    };
  });
}

function normalizeEligibilityConditions(
  value: unknown,
): EligibilityRuleCondition[] {
  const rawConditions =
    value &&
    typeof value === "object" &&
    Array.isArray((value as { conditions?: unknown }).conditions)
      ? (value as { conditions: unknown[] }).conditions
      : [];
  const normalized = rawConditions
    .map((condition) => {
      const record =
        condition && typeof condition === "object"
          ? (condition as Record<string, unknown>)
          : {};
      return {
        attribute:
          typeof record.attribute === "string" && record.attribute.trim()
            ? record.attribute.trim()
            : "employeeId",
        operator:
          typeof record.operator === "string" && record.operator.trim()
            ? record.operator.trim().toUpperCase()
            : "EQUALS",
        values: normalizeConditionValues(record.values ?? record.value),
      };
    })
    .filter((condition) => condition.attribute);
  return normalized.length ? normalized : [emptyEligibilityCondition()];
}

function normalizeConditionValues(value: unknown) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function updateEligibilityCondition(
  rule: EligibilityRuleDraft,
  index: number,
  patch: Partial<EligibilityRuleCondition>,
): EligibilityRuleDraft {
  return {
    ...rule,
    conditions: {
      conditions: rule.conditions.conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? { ...condition, ...patch } : condition,
      ),
    },
  };
}

function serializeEligibilityRule(rule: EligibilityRuleDraft) {
  return {
    ...(rule.id ? { id: rule.id } : {}),
    name: rule.name?.trim() || null,
    matchType: rule.matchType,
    priority: rule.priority,
    conditions: {
      conditions: rule.conditions.conditions.map((condition) => ({
        attribute: condition.attribute,
        operator: condition.operator,
        ...(condition.operator === "IS_EMPTY" ||
        condition.operator === "IS_NOT_EMPTY"
          ? {}
          : { values: condition.values }),
      })),
    },
    isActive: rule.isActive,
  };
}

function ReadOnlyField({
  field,
  label,
  required,
  error,
  touched,
  value,
}: {
  readonly field?: FieldMetadata;
  readonly label: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly touched?: boolean;
  readonly value: FieldValueMap[string];
}) {
  const externalLink = readOnlyExternalLink(value);
  if (externalLink) {
    return (
      <div className="block space-y-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {label}
          {required ? <span className="text-danger">*</span> : null}
        </span>
        <a
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm font-medium text-accent transition hover:border-accent/40 hover:bg-accent/5 hover:underline"
          href={externalLink.href}
          rel="noreferrer"
          target="_blank"
        >
          <span className="min-w-0 truncate">{externalLink.label}</span>
          <span aria-hidden className="shrink-0">
            ↗
          </span>
        </a>
        {error ? (
          <span className="block text-xs leading-5 text-danger">{error}</span>
        ) : null}
      </div>
    );
  }

  if (field?.dataType === "multiline-string" || field?.dataType === "json") {
    return (
      <TextAreaField
        disabled
        error={error}
        label={label}
        onChange={() => undefined}
        required={required}
        touched={touched}
        value={formatValue(value)}
      />
    );
  }

  return (
    <TextField
      disabled
      error={error}
      label={label}
      onChange={() => undefined}
      required={required}
      touched={touched}
      value={formatValue(value)}
    />
  );
}

function readOnlyExternalLink(value: FieldValueMap[string]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const href = candidate.href;
  const label = candidate.label;
  if (typeof href !== "string" || !/^https:\/\//i.test(href)) return null;
  if (typeof label !== "string" || !label.trim()) return null;
  return { href, label: label.trim() };
}

function firstError(errors: readonly string[] | undefined) {
  return errors?.[0];
}

function numericFieldValue(value: FieldValueMap[string]) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = Number(trimmed.replace(/,/g, ""));
  return Number.isFinite(normalized) ? normalized : null;
}

function FormHeading({ title }: { readonly title: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function inputTypeForField(field: FieldMetadata) {
  if (field.dataType === "email") return "email";
  if (field.dataType === "url") return "url";
  return "text";
}

function maskRuntimeFieldValue(
  value: FieldValueMap[string],
  maskingPattern?: string,
  customMask?: string | null,
) {
  const text = formatValue(value);
  if (!text) return text;
  const pattern = (maskingPattern || "FULL").toUpperCase();

  if (pattern === "CUSTOM" && customMask?.trim()) return customMask.trim();
  if (pattern === "LAST_4") {
    const visible = text.slice(-4);
    return `${"•".repeat(Math.max(text.length - visible.length, 4))}${visible}`;
  }
  if (pattern === "PARTIAL") {
    if (text.length <= 4) return "•".repeat(text.length);
    return `${text.slice(0, 2)}${"•".repeat(Math.max(text.length - 4, 4))}${text.slice(-2)}`;
  }

  return "•".repeat(Math.max(text.length, 6));
}

function isEditableRuntimeField({
  field,
  formField,
  mode,
  runtime,
}: {
  readonly field: FieldMetadata;
  readonly formField: FormFieldMetadata;
  readonly mode: "detail" | "edit" | "new";
  readonly runtime?: ModuleRuntimeContext;
}) {
  if (mode === "detail") return false;
  if (formField.isReadonly) return false;
  if (field.behavior !== "normal") return false;
  if (runtime && !resolveSafeFieldMetadata(runtime.security, field).canWrite) {
    return false;
  }

  const explicitlyUnlockedByForm =
    field.unlockableByCustomization && formField.isReadonly === false;

  if (field.autoGenerated && !explicitlyUnlockedByForm) return false;
  if (field.lockedByDefault && !explicitlyUnlockedByForm) return false;

  return true;
}

function shouldHideEmptyReadonlyCreateField({
  field,
  formField,
  mode,
  runtime,
  values,
}: {
  readonly field: FieldMetadata;
  readonly formField: FormFieldMetadata;
  readonly mode: "detail" | "edit" | "new";
  readonly runtime?: ModuleRuntimeContext;
  readonly values: FieldValueMap;
}) {
  if (mode !== "new" || !runtime?.module.key) return false;
  const hiddenFields = HIDDEN_EMPTY_CREATE_FIELDS_BY_MODULE[runtime.module.key];
  if (!hiddenFields?.has(field.logicalName)) return false;

  const isReadonly =
    formField.isReadonly === true ||
    field.autoGenerated ||
    field.lockedByDefault ||
    field.behavior !== "normal";
  if (!isReadonly) return false;

  const value = values[field.logicalName];
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function applyFieldValueChange({
  changedField,
  entity,
  value,
  values,
}: {
  readonly changedField: FieldMetadata;
  readonly entity: EntityMetadata;
  readonly value: FieldValueMap[string];
  readonly values: FieldValueMap;
}) {
  if (values[changedField.logicalName] === value) {
    return values;
  }

  const nextValues: FieldValueMap = {
    ...values,
    [changedField.logicalName]: value,
  };
  const fieldsToReset = dependentFieldNames(entity, changedField.logicalName);

  for (const fieldLogicalName of fieldsToReset) {
    nextValues[fieldLogicalName] = "";
  }

  return nextValues;
}

function ensureSelectedLookupOption({
  allLookupOptions,
  field,
  lookupDisplayValues,
  lookupOptions,
  value,
  values,
}: {
  readonly allLookupOptions: Record<string, readonly LookupOption[]>;
  readonly field: FieldMetadata;
  readonly lookupDisplayValues: Record<string, string>;
  readonly lookupOptions: readonly LookupOption[];
  readonly value: FieldValueMap[string];
  readonly values: FieldValueMap;
}) {
  if (field.dataType !== "lookup") return lookupOptions;

  const valueId = typeof value === "string" ? value.trim() : "";
  if (!valueId) return lookupOptions;
  if (
    lookupOptions.some((option) => lookupOptionMatchesValue(option, valueId))
  ) {
    return lookupOptions;
  }

  const displayName = resolveLookupDisplayValue(
    field,
    value,
    values,
    lookupDisplayValues,
    allLookupOptions,
  );
  if (!displayName) return lookupOptions;

  return [
    {
      id: valueId,
      name: displayName,
    },
    ...lookupOptions,
  ];
}

function resolveLookupDisplayValue(
  field: FieldMetadata,
  value: FieldValueMap[string],
  values: FieldValueMap,
  lookupDisplayValues: Record<string, string>,
  lookupOptions: Record<string, readonly LookupOption[]>,
) {
  if (field.dataType !== "lookup") return null;

  const explicitValue = lookupDisplayValues[field.logicalName];
  if (explicitValue) return explicitValue;

  const companionValue = companionLookupDisplayValue(field, values);
  if (companionValue) return companionValue;

  const valueId = typeof value === "string" ? value : "";
  if (!valueId) return null;

  return (
    lookupOptions[field.logicalName]?.find((option) =>
      lookupOptionMatchesValue(option, valueId),
    )?.name ?? (field.logicalName.endsWith("Code") ? valueId : null)
  );
}

function companionLookupDisplayValue(
  field: FieldMetadata,
  values: FieldValueMap,
) {
  const record = values as Record<string, unknown>;
  const baseName = field.logicalName.endsWith("Id")
    ? field.logicalName.slice(0, -"Id".length)
    : "";
  const companionName = baseName ? stringValue(record[`${baseName}Name`]) : "";
  if (companionName) return companionName;

  const target = field.lookupTargets?.[0];
  const nestedRecord = target?.entityLogicalName
    ? record[target.entityLogicalName]
    : null;
  if (isRecord(nestedRecord)) {
    return lookupPrimaryRecordValue(nestedRecord, target?.primaryNameField);
  }

  return "";
}

function lookupPrimaryRecordValue(
  record: Record<string, unknown>,
  primaryNameField?: string,
) {
  return (
    stringValue(record[primaryNameField ?? "name"]) ||
    stringValue(record.name) ||
    stringValue(record.fullName) ||
    stringValue(record.displayName) ||
    stringValue(record.label)
  );
}

function lookupOptionMatchesValue(option: LookupOption, value: string) {
  const normalizedValue = normalizeLookupValue(value);
  if (!normalizedValue) return false;

  return [option.id, option.code, option.key, option.name]
    .map(normalizeLookupValue)
    .some((candidate) => candidate === normalizedValue);
}

function normalizeLookupValue(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function loadDependentLookupOptions({
  changedField,
  dataAdapter,
  entity,
  nextValues,
  onLookupOptionsChange,
  runtime,
}: {
  readonly changedField: FieldMetadata;
  readonly dataAdapter?: ModuleDataAdapter;
  readonly entity: EntityMetadata;
  readonly nextValues: FieldValueMap;
  readonly onLookupOptionsChange?: (
    fieldLogicalName: string,
    options: readonly LookupOption[],
  ) => void;
  readonly runtime?: ModuleRuntimeContext;
}) {
  if (!dataAdapter?.getLookupOptions || !runtime) return;

  const directDependents = entity.fields.filter(
    (field) =>
      field.dataType === "lookup" &&
      field.dependsOnFieldId === changedField.logicalName,
  );

  for (const dependent of directDependents) {
    const options = await dataAdapter.getLookupOptions(
      runtime,
      dependent,
      nextValues,
    );
    onLookupOptionsChange?.(
      dependent.logicalName,
      options.map((option) => ({
        id: option.id,
        name: option.name,
        key: option.key,
        code: option.code,
        subtitle: option.subtitle,
      })),
    );
  }
}

function dependentFieldNames(
  entity: EntityMetadata,
  parentFieldLogicalName: string,
) {
  const pending = [parentFieldLogicalName];
  const result = new Set<string>();

  while (pending.length) {
    const parent = pending.shift();
    if (!parent) continue;

    for (const field of entity.fields) {
      if (
        field.resetOnParentChange &&
        field.dependsOnFieldId === parent &&
        !result.has(field.logicalName)
      ) {
        result.add(field.logicalName);
        pending.push(field.logicalName);
      }
    }
  }

  return result;
}

function lookupReferenceHref(
  field: FieldMetadata,
  value: string,
  lookupOptions: readonly LookupOption[],
) {
  if (field.dataType !== "lookup" || !value) return undefined;

  const target = field.lookupTargets?.[0]?.entityLogicalName;
  if (!target) return undefined;

  const route = lookupReferenceRoute(target);
  if (!route) return undefined;

  const selected = lookupOptions.find((option) =>
    lookupOptionMatchesValue(option, value),
  );
  const recordId = selected?.key || value;
  const encodedRecordId = encodeURIComponent(recordId);

  if (READ_ONLY_REFERENCE_MODULES.has(route.moduleKey)) {
    return `${route.basePath}?reference=${encodeURIComponent(value)}`;
  }

  return `${route.basePath}/${encodedRecordId}`;
}

function lookupReferenceRoute(entityLogicalName: string) {
  const normalized = entityLogicalName
    .replace(/^settings_/, "")
    .replaceAll("_", "-");

  const route = LOOKUP_REFERENCE_ROUTES[normalized];
  return route
    ? {
        basePath: route,
        moduleKey: normalized,
      }
    : null;
}

const LOOKUP_REFERENCE_ROUTES: Readonly<Record<string, string>> = {
  countries: "/settings/regional/geography/countries",
  stateprovinces: "/settings/regional/geography/states",
  "state-provinces": "/settings/regional/geography/states",
  cities: "/settings/regional/geography/cities",
  currencies: "/settings/regional/currency/currencies",
  timezones: "/settings/regional/localization/timezones",
  departments: "/settings/general-setup/organization/departments",
  designations: "/settings/people/workforce/designations",
  "employee-levels": "/settings/people/workforce/employee-levels",
  locations: "/settings/people/work-management/locations",
  "work-calendars": "/settings/people/work-management/work-calendars",
  "holiday-calendars": "/settings/people/work-management/holiday-calendars",
  shifts: "/settings/people/work-management/shifts",
  "work-schedules": "/settings/people/work-management/work-schedules",
  users: "/settings/security-access/users",
  roles: "/settings/access/roles",
  teams: "/settings/access/teams",
  employees: "/employees",
};

const READ_ONLY_REFERENCE_MODULES = new Set([
  "countries",
  "currencies",
  "timezones",
]);

function formatValue(value: FieldValueMap[string]) {
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return value.every((item) => typeof item === "string")
      ? value.join(", ")
      : JSON.stringify(value, null, 2);
  }
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
