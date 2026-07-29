import type { StandardModuleRuntimeSpec } from "@/lib/runtime/modules/standard-module-runtime";
import { employeeCompensationRuntimeSpec } from "@/lib/runtime/modules/payroll-foundation-runtime-specs";

export type PayComponentRecord = {
  id: string;
  code?: string | null;
  name?: string | null;
  componentType?: string | null;
  calculationMethod?: string | null;
  formulaExpression?: string | null;
  displayOrder?: number | null;
};

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
