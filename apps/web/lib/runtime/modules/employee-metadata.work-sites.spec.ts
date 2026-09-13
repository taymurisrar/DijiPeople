import type { RuntimeCustomizationForm } from "../../customization-forms";
import {
  buildEmployeeEntityMetadata,
  mapEmployeeForms,
  withoutCreateOnlyEmployeeFields,
} from "./employee-metadata.adapter";

/*
 * ITEM-0179 / ADR-0014 — work sites are a Work Sites related-records tab, not
 * a widget in the Organization section. ITEM-0184 — the Record Status popover
 * shows one status, and create-time instructions are not fields of a saved
 * record.
 */

function mainSystemForm() {
  const form = mapEmployeeForms([]).find((item) => item.formType === "main");
  if (!form) throw new Error("the system employee main form is missing");
  return form;
}

function widgetIds(form: ReturnType<typeof mainSystemForm>) {
  return form.sections.flatMap((section) =>
    (section.components ?? []).map((component) => component.widgetId),
  );
}

describe("Work Sites tab", () => {
  const form = mainSystemForm();
  const tab = form.tabs?.find((item) => item.tabKey === "work-sites");
  const subgrid = tab?.subgrid;

  it("is a related-records tab rendered by the standard subgrid", () => {
    expect(tab?.type).toBe("related_module");
    expect(tab?.label).toBe("Work Sites");
    expect(subgrid?.relationshipName).toBe("employee_work_sites");
  });

  it("binds to the employee through a declared relationship", () => {
    // `resolveParentBinding` in the form renderer finds the parent key here;
    // without it the subgrid never loads.
    const relationship = buildEmployeeEntityMetadata().relationships?.find(
      (item) => item.relationshipName === "employee_work_sites",
    );
    expect(relationship?.targetFieldLogicalName).toBe("employeeId");
  });

  it("shows site, primary, valid from and valid to", () => {
    expect(subgrid?.columns?.map((column) => column.label)).toEqual([
      "Site",
      "Primary",
      "Valid From",
      "Valid To",
    ]);
  });

  it("writes only through the attendance work-site endpoints", () => {
    const base = "/api/integrations/attendance/employees/{parentId}/work-sites";
    expect(subgrid?.api).toMatchObject({
      listPath: base,
      createPath: base,
      updatePath: base,
      deletePath: `${base}/{recordId}`,
      permissions: {
        create: "attendanceDevices.manage",
        update: "attendanceDevices.manage",
        delete: "attendanceDevices.manage",
      },
    });
  });

  it("offers Make primary as a row action, not on the primary row", () => {
    expect(subgrid?.rowActions).toEqual([
      {
        key: "setPrimary",
        label: "Make primary",
        hiddenWhenFieldTrue: "isPrimary",
        permissions: "attendanceDevices.manage",
      },
    ]);
    expect(subgrid?.removeConfirmation?.title).toBeTruthy();
  });

  it("is only offered to someone who can read work sites", () => {
    expect(tab?.visibilityRules).toEqual([
      { operator: "has-permission", permissionKeys: ["attendanceDevices.read"] },
    ]);
  });

  it("replaces the in-form widget", () => {
    expect(widgetIds(form)).not.toContain("employee.workSites");
  });

  it("is added to, and strips the retired widget from, a stored layout", () => {
    const stored = {
      id: "stored-main",
      tableKey: "employees",
      formKey: "main",
      name: "Main",
      type: "main",
      isDefault: true,
      isActive: true,
      layoutJson: {
        columns: 3,
        tabs: [
          {
            id: "summary",
            label: "Summary",
            sections: [
              {
                id: "organization",
                label: "Organization",
                columns: 1,
                fields: [{ columnKey: "locationId" }],
                components: [
                  {
                    id: "legacy-work-sites",
                    widgetId: "employee.workSites",
                    widgetType: "employee_work_sites",
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as RuntimeCustomizationForm;

    const mapped = mapEmployeeForms([stored]).find(
      (item) => item.id === "stored-main",
    );

    expect(mapped).toBeDefined();
    expect(
      mapped?.sections.flatMap((section) =>
        (section.components ?? []).map((component) => component.widgetId),
      ),
    ).not.toContain("employee.workSites");
    expect(mapped?.tabs?.map((item) => item.tabKey)).toContain("work-sites");
  });
});

describe("create-time employee fields", () => {
  const form = mainSystemForm();
  const fieldNames = (target: typeof form) =>
    target.sections.flatMap((section) =>
      section.fields.map((field) => field.fieldLogicalName),
    );

  it("are not shown on an existing record", () => {
    const names = fieldNames(withoutCreateOnlyEmployeeFields(form));
    expect(names).not.toContain("provisionSystemAccess");
    expect(names).not.toContain("sendInvitationNow");
    expect(names).toContain("userId");
  });

  it("stay on the form used to create an employee", () => {
    expect(fieldNames(form)).toEqual(
      expect.arrayContaining(["provisionSystemAccess", "sendInvitationNow"]),
    );
  });
});

describe("Record Status popover for employees", () => {
  it("uses Employment Status and no Sub Status", () => {
    const entity = buildEmployeeEntityMetadata();
    expect(entity.statusField).toBe("employmentStatus");
    expect(entity.subStatusField).toBeUndefined();
  });
});
