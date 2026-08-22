import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import { employeeCompensationRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";

export type PayComponentRecord = {
  id: string;
  code?: string | null;
  name?: string | null;
  componentType?: string | null;
  calculationMethod?: string | null;
  formulaExpression?: string | null;
  isRecurring?: boolean | null;
  displayOrder?: number | null;
};

/**
 * Turn the flat form values this module generates into the body the API wants.
 *
 * The compensation form renders one field per active pay component, named
 * `component_<payComponentId>` — a shape no static field list can describe,
 * because the component set is a tenant's data. The API takes a `components`
 * array instead, with each entry carrying either an `amount` or a `percentage`
 * depending on the component's `calculationMethod`.
 *
 * That translation used to live in `app/api/payroll/compensations/route.ts`,
 * where it also made a second API call to `/pay-components` to learn each
 * method, and derived `basicSalary` as *the first component with a non-empty
 * amount* when the caller omitted it. Two problems with that last part: a
 * payroll rule — what counts as basic salary — was living in a route proxy with
 * no tests, no audit trail and no server-side validation; and "first non-empty
 * component" is a guess no domain service ever agreed to. BUG-0041 / ITEM-0050.
 *
 * It is gone. `basicSalary` is required by the form (`requirementLevel:
 * "required"`) and required by the API (`CreateEmployeeCompensationDto`), so
 * the two now agree: a caller that omits it gets a 400 naming the field, rather
 * than a silently invented salary. Nothing here computes money — it moves the
 * number the user typed, or it sends nothing.
 *
 * The second API call is gone too: this runs where the pay components have
 * already been loaded to build the form.
 */
export function buildCompensationMutationPayload(
  payComponents: readonly PayComponentRecord[],
  payload: Record<string, unknown>,
  values: Readonly<Record<string, unknown>>,
  mode: "create" | "update",
): Record<string, unknown> {
  const components = payComponents.flatMap((component) => {
    const fieldName = componentFieldName(component.id);

    // On update, absence means "not on this form" — sending it as empty would
    // clear a component the user never saw. On create there is no prior state
    // to preserve, and the API is given the full active set so the record is
    // born with every component the tenant has, valued or not.
    const present = Object.prototype.hasOwnProperty.call(values, fieldName);
    if (mode === "update" && !present) return [];

    const raw = present ? values[fieldName] : undefined;
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    const isPercentage = component.calculationMethod === "PERCENTAGE";

    return [
      {
        payComponentId: component.id,
        ...(isPercentage
          ? { percentage: value || undefined }
          : { amount: value || undefined }),
        ...(typeof component.isRecurring === "boolean"
          ? { isRecurring: component.isRecurring }
          : {}),
        ...(typeof component.displayOrder === "number"
          ? { displayOrder: component.displayOrder }
          : {}),
      },
    ];
  });

  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(payload)) {
    // The generated per-component fields are represented by `components`; the
    // read-only derived totals are the API's to compute, never the client's to
    // send back.
    if (key.startsWith("component_")) continue;
    if (DERIVED_COMPENSATION_FIELDS.has(key)) continue;
    next[key] = entry;
  }

  next.components = components;
  return next;
}

/** Computed by the API and shown read-only; never sent back on a write. */
const DERIVED_COMPENSATION_FIELDS = new Set([
  "grossEarnings",
  "totalDeductions",
  "estimatedNetPay",
]);

export function asCompensationPayComponents(
  compensation: Record<string, unknown>,
  fallback: readonly PayComponentRecord[] = [],
): PayComponentRecord[] {
  const components = Array.isArray(compensation.components)
    ? compensation.components
    : [];
  const payComponents = components
    .map((component) => {
      if (!isRecord(component)) return null;
      const payComponent = isRecord(component.payComponent)
        ? component.payComponent
        : component;
      return toPayComponentRecord(payComponent);
    })
    .filter((component): component is PayComponentRecord => Boolean(component));

  return payComponents.length ? payComponents : [...fallback];
}

export function buildEmployeeCompensationSpec(
  payComponents: readonly PayComponentRecord[],
): StandardModuleRuntimeSpec {
  const dynamicFields = payComponents.map((component) => ({
    logicalName: componentFieldName(component.id),
    displayName:
      component.name?.trim() || component.code?.trim() || "Pay Component",
    dataType:
      component.calculationMethod === "PERCENTAGE" &&
      !component.formulaExpression?.trim()
        ? ("number" as const)
        : ("currency" as const),
    isReadOnly:
      component.calculationMethod === "FORMULA" ||
      component.calculationMethod === "SYSTEM_CALCULATED" ||
      Boolean(component.formulaExpression?.trim()),
  }));

  return {
    ...employeeCompensationRuntimeSpec,
    mutationPayloadTransform: (payload, values, mode) =>
      buildCompensationMutationPayload(payComponents, payload, values, mode),
    fields: [
      ...employeeCompensationRuntimeSpec.fields.filter(
        (field) => field.logicalName !== "basicSalary",
      ),
      {
        logicalName: "basicSalary",
        displayName: "Base Amount",
        dataType: "currency",
      },
      ...dynamicFields,
      {
        logicalName: "grossEarnings",
        displayName: "Gross Earnings",
        dataType: "currency",
        isReadOnly: true,
      },
      {
        logicalName: "totalDeductions",
        displayName: "Total Deductions",
        dataType: "currency",
        isReadOnly: true,
      },
      {
        logicalName: "estimatedNetPay",
        displayName: "Estimated Net Pay",
        dataType: "currency",
        isReadOnly: true,
      },
    ],
    formSections: [
      {
        id: "employee-compensation-employment",
        tabKey: "general",
        label: "Employee",
        order: 10,
        layout: "three-column",
        columns: 3,
        fields: [
          {
            fieldLogicalName: "employeeId",
            order: 10,
            requirementLevel: "required",
          },
          {
            fieldLogicalName: "currency",
            order: 20,
            requirementLevel: "required",
          },
          {
            fieldLogicalName: "payFrequency",
            order: 30,
            requirementLevel: "required",
          },
          {
            fieldLogicalName: "effectiveDate",
            order: 40,
            requirementLevel: "required",
          },
          { fieldLogicalName: "endDate", order: 50 },
          { fieldLogicalName: "payrollStatus", order: 60 },
        ],
      },
      {
        id: "employee-compensation-components",
        tabKey: "general",
        label: "Pay Components",
        order: 20,
        layout: "three-column",
        columns: 3,
        fields: [
          {
            fieldLogicalName: "basicSalary",
            order: 10,
            requirementLevel: "required",
          },
          ...payComponents.map((component, index) => ({
            fieldLogicalName: componentFieldName(component.id),
            order: (index + 2) * 10,
          })),
          { fieldLogicalName: "grossEarnings", order: 900 },
          { fieldLogicalName: "totalDeductions", order: 910 },
          { fieldLogicalName: "estimatedNetPay", order: 920 },
        ],
      },
      {
        id: "employee-compensation-notes",
        tabKey: "general",
        label: "Notes",
        order: 30,
        layout: "single-column",
        columns: 1,
        fields: [{ fieldLogicalName: "notes", order: 10 }],
      },
    ],
    formFields: [
      "employeeId",
      "currency",
      "payFrequency",
      "effectiveDate",
      "endDate",
      "payrollStatus",
      "basicSalary",
      ...payComponents.map((component) => componentFieldName(component.id)),
      "grossEarnings",
      "totalDeductions",
      "estimatedNetPay",
      "notes",
    ],
    views: employeeCompensationRuntimeSpec.views.map((view) => ({
      ...view,
      columns: [
        "employeeName",
        "employeeCode",
        "basicSalary",
        "grossEarnings",
        "totalDeductions",
        "estimatedNetPay",
        "currency",
        "payFrequency",
        "payrollStatus",
        "effectiveDate",
      ],
    })),
  };
}

export function asPayComponents(value: unknown): PayComponentRecord[] {
  return Array.isArray(value)
    ? value
        .map(toPayComponentRecord)
        .filter((component): component is PayComponentRecord =>
          Boolean(component),
        )
    : [];
}

function toPayComponentRecord(value: unknown): PayComponentRecord | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    code: stringOrNull(value.code),
    name: stringOrNull(value.name),
    componentType: stringOrNull(value.componentType),
    calculationMethod: stringOrNull(value.calculationMethod),
    formulaExpression: stringOrNull(value.formulaExpression),
    isRecurring:
      typeof value.isRecurring === "boolean" ? value.isRecurring : null,
    displayOrder:
      typeof value.displayOrder === "number" ? value.displayOrder : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function componentFieldName(payComponentId: string) {
  return `component_${payComponentId}`;
}
