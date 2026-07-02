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
import { debugRuntime } from "@/lib/runtime/runtime-debug";
import { resolveSafeFieldMetadata } from "@/lib/runtime/security-runtime.resolver";
import { formatRuntimeFieldValue } from "@/lib/runtime/runtime-value-formatter";

export type FieldValueMap = Record<
  string,
  string | number | boolean | readonly string[] | null | undefined
>;

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
  readonly tabContent?: Readonly<Record<string, ReactNode>>;
};

type RuntimeMetadataFormRendererProps =
  | CustomizationFormRendererProps
  | RuntimeFormRendererProps;

const SEED_BACKED_LOOKUP_FIELDS = new Set([
  "countryId",
  "nationalityCountryId",
  "stateProvinceId",
  "cityId",
  "emergencyContactRelationTypeId",
  "departmentId",
  "designationId",
  "employeeLevelId",
  "locationId",
  "officialJoiningLocationId",
  "defaultWorkScheduleId",
  "documentTypeId",
  "documentCategoryId",
  "leaveTypeId",
  "officeLocationId",
]);

const MISSING_REFERENCE_DATA_MESSAGE =
  "Reference data missing. Please run seed-config.";

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
                  <dl className={`grid gap-4 ${gridClass(section.columns)}`}>
                    {(section.fields ?? [])
                      .filter((field) => field.isVisible !== false)
                      .map((field) => (
                        <ReadOnlyField
                          key={`${section.id}-${field.columnKey}`}
                          label={field.label ?? field.columnKey}
                          required={field.required}
                          value={values[field.columnKey]}
                        />
                      ))}
                  </dl>
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
  readonly tabContent?: Readonly<Record<string, ReactNode>>;
}) {
  const fieldsByName = new Map(
    entity.fields.map((field) => [field.logicalName, field]),
  );
  const tabs = resolveFormTabs(form);
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.tabKey ?? "");
  const [dynamicLookupOptions, setDynamicLookupOptions] = useState<
    Record<string, readonly LookupOption[]>
  >({});
  const [hydratedLookupFields, setHydratedLookupFields] = useState<
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
  const visibleSections = resolveTabSections(form, activeTab);
  return (
    <article className="rounded-lg border border-border bg-surface shadow-sm">
      {tabs.length > 1 ? (
        <div className="border-b border-border px-4 pt-4">
          <ResponsiveRuntimeTabs
            activeTabKey={activeTab?.tabKey ?? ""}
            onTabChange={setActiveTabKey}
            tabs={tabs}
          />
        </div>
      ) : null}

      <div className="p-5">
        {activeTab && tabContent?.[activeTab.tabKey] ? (
          tabContent[activeTab.tabKey]
        ) : activeTab?.type === "related_module" ? (
          activeTab.subgrid ? (
            <ModuleRelatedSubgrid
              dataAdapter={dataAdapter}
              parentBinding={resolveParentBinding(
                entity,
                activeTab.subgrid.relationshipName,
                runtime?.recordId,
              )}
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
            onLookupOptionsChange={(fieldLogicalName, options) =>
              setDynamicLookupOptions((current) => ({
                ...current,
                [fieldLogicalName]: options,
              }))
            }
            onLookupHydrated={(fieldLogicalName) =>
              setHydratedLookupFields((current) => {
                if (current.has(fieldLogicalName)) return current;
                return new Set([...current, fieldLogicalName]);
              })
            }
            onValuesChange={onValuesChange}
            deriveValuesOnChange={deriveValuesOnChange}
            resolveFieldEditable={resolveFieldEditable}
            runtime={runtime}
            sections={visibleSections}
            touchedFields={touchedFields}
            values={values}
          />
        )}
      </div>
    </article>
  );
}

function RuntimeSectionColumns({
  columnCount,
  sections,
  ...sectionProps
}: {
  readonly columnCount: 1 | 2 | 3 | 4;
  readonly sections: readonly FormSectionMetadata[];
} & Omit<Parameters<typeof RuntimeSection>[0], "section">) {
  const regularSections = sections.filter(
    (section) => !isFullWidthRuntimeSection(section, columnCount),
  );
  const fullWidthSections = sections.filter(
    (section) => isFullWidthRuntimeSection(section, columnCount),
  );

  return (
    <div className="grid gap-5">
      <div
        className={`grid items-start gap-5 ${runtimeTabGridClass(columnCount)}`}
      >
        {Array.from({ length: columnCount }, (_, index) => index + 1).map(
          (column) => (
            <div className="grid gap-5" key={column}>
              {regularSections
                .filter(
                  (section, sectionIndex) =>
                    (section.column ?? (sectionIndex % columnCount) + 1) ===
                    column,
                )
                .map((section) => (
                  <RuntimeSection
                    {...sectionProps}
                    key={section.id}
                    section={section}
                  />
                ))}
            </div>
          ),
        )}
      </div>
      {fullWidthSections.map((section) => (
        <RuntimeSection {...sectionProps} key={section.id} section={section} />
      ))}
    </div>
  );
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

function isFullWidthRuntimeSection(
  section: FormSectionMetadata,
  columnCount: 1 | 2 | 3 | 4,
) {
  if ((section.columnSpan ?? 1) >= columnCount) return true;

  return (section.components ?? []).some(
    (component) =>
      component.type === "widget" &&
      (component.widgetType === "agent_desktop" ||
        (component.columnSpan ?? 1) >= columnCount),
  );
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

function resolveFormTabs(form: FormMetadata): readonly FormTabMetadata[] {
  const explicitTabs = (form.tabs ?? [])
    .filter((tab) => tab.isVisible !== false)
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
) {
  if (!activeTab) return form.sections;

  const sectionIds = new Set(activeTab.sectionIds ?? []);

  return form.sections
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
  fieldErrors,
  onLookupOptionsChange,
  onLookupHydrated,
  onValuesChange,
  deriveValuesOnChange,
  resolveFieldEditable,
  runtime,
  section,
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
  readonly fieldErrors: Record<string, readonly string[]>;
  readonly onLookupOptionsChange?: (
    fieldLogicalName: string,
    options: readonly LookupOption[],
  ) => void;
  readonly onLookupHydrated?: (fieldLogicalName: string) => void;
  readonly onValuesChange?: (values: FieldValueMap) => void;
  readonly deriveValuesOnChange?: ValuesChangeDeriver;
  readonly resolveFieldEditable?: FieldEditabilityResolver;
  readonly runtime?: ModuleRuntimeContext;
  readonly section: FormSectionMetadata;
  readonly allowedWidgetComponentIds: ReadonlySet<string>;
  readonly touchedFields?: ReadonlySet<string>;
  readonly values: FieldValueMap;
}) {
  const visibleFields = section.fields.filter(
    (field) =>
      field.isVisible !== false &&
      fieldsByName.has(field.fieldLogicalName) &&
      isFormFieldVisible(field, values),
  );
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
    if (mode === "detail" || !getLookupOptions || !runtime) {
      return;
    }
    const currentRuntime = runtime;
    const loadLookupOptions: NonNullable<ModuleDataAdapter["getLookupOptions"]> =
      getLookupOptions;

    const fieldsToHydrate = visibleFields
      .map((formField) => fieldsByName.get(formField.fieldLogicalName))
      .filter(
        (field): field is FieldMetadata =>
          field !== undefined &&
          field.dataType === "lookup" &&
          !lookupOptions[field.logicalName]?.length &&
          !hydratedLookupFields.has(field.logicalName),
      );

    if (fieldsToHydrate.length === 0) return;

    let cancelled = false;

    async function hydrateLookupFields() {
      await Promise.all(
        fieldsToHydrate.map(async (field) => {
          try {
            const options = await loadLookupOptions(
              currentRuntime,
              field,
              values,
            );
            if (cancelled) return;
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
          } finally {
            if (!cancelled) {
              onLookupHydrated?.(field.logicalName);
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
    lookupOptions,
    mode,
    onLookupHydrated,
    onLookupOptionsChange,
    runtime,
    values,
    visibleFields,
  ]);

  if (visibleFields.length === 0 && visibleComponents.length === 0) return null;

  return (
    <section className="grid gap-4">
      <h4 className="text-base font-semibold text-foreground">
        {section.label}
      </h4>
      <div className="rounded-2xl border border-border bg-white/80 p-4">
        <dl
          className={`grid gap-4 ${runtimeGridClass(section.columns ?? columnsFromLayout(section.layout))}`}
        >
          {visibleFields.map((formField) => {
            const field = fieldsByName.get(formField.fieldLogicalName);
            if (!field) return null;

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

            debugRuntime("Form field editability", {
              fieldLogicalName: field.logicalName,
              mode,
              editable: resolvedFieldEditable,
              formReadonly: formField.isReadonly,
              behavior: field.behavior,
              autoGenerated: field.autoGenerated,
              lockedByDefault: field.lockedByDefault,
              unlockableByCustomization: field.unlockableByCustomization,
            });

            return !resolvedFieldEditable ? (
              <div
                data-runtime-field={field.logicalName}
                key={`${section.id}-${formField.fieldLogicalName}`}
              >
                <ReadOnlyField
                  label={formField.label ?? field.displayName}
                  required={formField.requirementLevel === "required"}
                  error={firstError(fieldErrors[field.logicalName])}
                  touched={touchedFields?.has(field.logicalName)}
                  value={formatRuntimeFieldValue({
                    field,
                    lookupDisplayValue:
                      resolveLookupDisplayValue(
                        field,
                        values[field.logicalName],
                        lookupDisplayValues,
                        lookupOptions,
                      ) ?? lookupDisplayValues[field.logicalName],
                    tenant: runtime?.tenant,
                    value: values[field.logicalName],
                  })}
                />
              </div>
            ) : (
              <div
                data-runtime-field={field.logicalName}
                key={`${section.id}-${formField.fieldLogicalName}`}
              >
                <EditableField
                  field={field}
                  label={formField.label ?? field.displayName}
                  lookupOptions={lookupOptions[field.logicalName] ?? []}
                  lookupOptionsHydrated={
                    hydratedLookupFields.has(field.logicalName) ||
                    Boolean(lookupOptions[field.logicalName]?.length) ||
                    !dataAdapter?.getLookupOptions
                  }
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
                  required={formField.requirementLevel === "required"}
                  touched={touchedFields?.has(field.logicalName)}
                  value={values[field.logicalName]}
                />
              </div>
            );
          })}
          {visibleComponents.map((component) => (
            <RuntimeComponent
              component={component}
              key={component.id}
              dataAdapter={dataAdapter}
              runtime={runtime}
              sectionColumns={
                section.columns ?? columnsFromLayout(section.layout)
              }
            />
          ))}
        </dl>
      </div>
    </section>
  );
}

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
  readonly sectionColumns: 1 | 2 | 3 | 4;
}) {
  const spanClass = columnSpanClass(component.columnSpan ?? sectionColumns);

  if (component.type === "notes") {
    return (
      <div
        className={`${spanClass} rounded-lg border border-dashed border-border p-4 text-sm text-muted`}
      >
        Notes will appear here when reusable note storage is connected.
      </div>
    );
  }

  if (component.type === "relatedList") {
    return (
      <div
        className={`${spanClass} rounded-lg border border-dashed border-border p-4 text-sm text-muted`}
      >
        Related List metadata is present. Connect a related data adapter to show
        records.
      </div>
    );
  }

  if (component.type === "widget" && component.widgetType) {
    return (
      <div className={spanClass}>
        <ModuleWidgetRenderer
          component={component}
          dataAdapter={dataAdapter}
          runtime={runtime}
        />
      </div>
    );
  }

  return null;
}

function EditableField({
  field,
  label,
  lookupOptions,
  lookupOptionsHydrated,
  error,
  onValueChange,
  required,
  touched,
  value,
}: {
  readonly field: FieldMetadata;
  readonly label: string;
  readonly lookupOptions: readonly LookupOption[];
  readonly lookupOptionsHydrated: boolean;
  readonly error?: string;
  readonly onValueChange?: (value: FieldValueMap[string]) => void;
  readonly required?: boolean;
  readonly touched?: boolean;
  readonly value: FieldValueMap[string];
}) {
  const fieldValue = value === null || value === undefined ? "" : String(value);
  const checked = Boolean(value);
  const numberValue =
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const lookupReferenceDataMissing =
    field.dataType === "lookup" &&
    lookupOptionsHydrated &&
    lookupOptions.length === 0 &&
    SEED_BACKED_LOOKUP_FIELDS.has(field.logicalName);
  const lookupWarning = lookupReferenceDataMissing
    ? MISSING_REFERENCE_DATA_MESSAGE
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
            noResultsText={
              lookupReferenceDataMissing
                ? MISSING_REFERENCE_DATA_MESSAGE
                : undefined
            }
            options={[...lookupOptions]}
            placeholder="Select record"
            required={required}
            touched={touched}
            value={fieldValue}
            warning={lookupWarning}
          />
        ) : field.dataType === "date" ? (
          <DateField
            label={label}
            error={error}
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

function ReadOnlyField({
  label,
  required,
  error,
  touched,
  value,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly touched?: boolean;
  readonly value: FieldValueMap[string];
}) {
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

function firstError(errors: readonly string[] | undefined) {
  return errors?.[0];
}

function FormHeading({ title }: { readonly title: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function gridClass(columns = 2) {
  if (columns === 1) return "md:grid-cols-1";
  if (columns === 3) return "md:grid-cols-3";
  if (columns === 4) return "md:grid-cols-4";
  return "md:grid-cols-2";
}

function runtimeGridClass(columns: 1 | 2 | 3 | 4) {
  if (columns === 1) return "md:grid-cols-1";
  if (columns === 3) return "md:grid-cols-3";
  if (columns === 4) return "md:grid-cols-4";
  return "md:grid-cols-2";
}

function runtimeTabGridClass(columns: 1 | 2 | 3 | 4) {
  if (columns === 2) return "lg:grid-cols-2";
  if (columns === 3) return "lg:grid-cols-3";
  if (columns === 4) return "lg:grid-cols-4";
  return "grid-cols-1";
}

function columnsFromLayout(
  layout: FormSectionMetadata["layout"],
): 1 | 2 | 3 | 4 {
  if (layout === "single-column") return 1;
  if (layout === "three-column") return 3;
  if (layout === "four-column") return 4;
  return 2;
}

function columnSpanClass(span: 1 | 2 | 3 | 4) {
  if (span === 2) return "md:col-span-2";
  if (span === 3) return "md:col-span-3";
  if (span === 4) return "md:col-span-4";
  return "";
}

function inputTypeForField(field: FieldMetadata) {
  if (field.dataType === "email") return "email";
  if (field.dataType === "url") return "url";
  return "text";
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

function resolveLookupDisplayValue(
  field: FieldMetadata,
  value: FieldValueMap[string],
  lookupDisplayValues: Record<string, string>,
  lookupOptions: Record<string, readonly LookupOption[]>,
) {
  if (field.dataType !== "lookup") return null;

  const explicitValue = lookupDisplayValues[field.logicalName];
  if (explicitValue) return explicitValue;

  const valueId = typeof value === "string" ? value : "";
  if (!valueId) return null;

  return (
    lookupOptions[field.logicalName]?.find((option) => option.id === valueId)
      ?.name ?? null
  );
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

function formatValue(
  value: string | number | boolean | readonly string[] | null | undefined,
) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "Not set";
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
