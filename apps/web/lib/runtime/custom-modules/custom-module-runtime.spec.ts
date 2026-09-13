import {
  buildCustomModuleForms,
  buildCustomModuleRuntime,
  buildCustomModuleRuntimeSpec,
  buildCustomModuleViews,
  mapCustomFieldDataType,
  resolveCustomModuleRecordTitle,
  type CustomModuleDefinition,
} from "./custom-module-runtime";
import { resolveStandardActiveForm } from "../modules/standard-module-route-helpers";

/*
 * BUG-3494 / ADR-0016 — route metadata resolution. A published definition must
 * become a working standard runtime (routes, data path, list columns, form)
 * with no code naming the module. The second, differently-shaped module below
 * is the "zero code changes" check.
 */

/* The demo tenant's module, as the API returns it. */
const QA_ASSET: CustomModuleDefinition = {
  moduleKey: "qaAsset",
  displayName: "QA Asset",
  pluralDisplayName: "QA Assets",
  primaryNameField: "dd_serialNumber",
  fields: [
    {
      logicalName: "dd_serialNumber",
      displayName: "Serial Number",
      dataType: "text",
      required: false,
      readOnly: false,
    },
  ],
  forms: [
    {
      id: "form-main",
      formKey: "main",
      name: "Main",
      type: "main",
      isDefault: true,
      layoutJson: {
        columns: 2,
        tabs: [
          {
            id: "general",
            label: "General",
            sections: [
              {
                id: "details",
                label: "Details",
                fields: [
                  { columnKey: "dd_serialNumber", label: "Serial Number" },
                  { columnKey: "dd_draftColumn", label: "Draft" },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
  views: [
    {
      id: "view-active",
      viewKey: "activeQaAssets",
      name: "Active QA Assets",
      isDefault: false,
      columnsJson: [
        { columnKey: "dd_serialNumber", label: "Serial Number" },
        { columnKey: "dd_notPublished" },
        "createdAt",
      ],
      filtersJson: [
        { columnKey: "dd_serialNumber", operator: "equals", value: "X" },
        { columnKey: "dd_notPublished", operator: "eq", value: "Y" },
      ],
      sortingJson: [{ columnKey: "createdAt", direction: "desc" }],
    },
    {
      id: "view-all",
      viewKey: "qaAllAssets",
      name: "QA All Assets",
      columnsJson: { columns: [] },
    },
  ],
  capabilities: { read: true, create: true, update: true, delete: false },
};

/* A second module: several types, no views, no forms, read-only user. */
const VEHICLE: CustomModuleDefinition = {
  moduleKey: "fleetVehicle",
  displayName: "Vehicle",
  pluralDisplayName: "Vehicles",
  primaryNameField: "pl_plate",
  fields: [
    {
      logicalName: "pl_plate",
      displayName: "Plate",
      dataType: "text",
      required: true,
    },
    { logicalName: "pl_notes", displayName: "Notes", dataType: "textarea" },
    { logicalName: "pl_seats", displayName: "Seats", dataType: "number" },
    {
      logicalName: "pl_fuel",
      displayName: "Fuel",
      dataType: "select",
      options: [
        { value: "petrol", label: "Petrol" },
        { value: "diesel", label: "Diesel" },
      ],
    },
    {
      logicalName: "pl_active",
      displayName: "Active",
      dataType: "boolean",
      readOnly: true,
    },
  ],
  forms: [],
  views: [],
  capabilities: { read: true, create: false, update: false, delete: false },
};

describe("buildCustomModuleRuntimeSpec", () => {
  it("routes the module under /custom-modules and persists through /api/data", () => {
    const spec = buildCustomModuleRuntimeSpec(QA_ASSET);
    expect(spec.routeBase).toBe("/custom-modules/qaAsset");
    expect(spec.moduleKey).toBe("custom-modules/qaAsset");
    expect(`/${spec.moduleKey}`).toBe(spec.routeBase);
    expect(spec.apiPath).toBe("/api/data/qaAsset");
    expect(spec.entityLogicalName).toBe("qaAsset");
    expect(spec.label).toBe("QA Assets");
    expect(spec.singularLabel).toBe("QA Asset");
    expect(spec.primaryNameField).toBe("dd_serialNumber");
  });

  it("declares the published fields plus read-only timestamps, and only published fields are writable", () => {
    const spec = buildCustomModuleRuntimeSpec(QA_ASSET);
    expect(spec.fields.map((field) => field.logicalName)).toEqual([
      "dd_serialNumber",
      "createdAt",
      "updatedAt",
    ]);
    /*
     * The standard adapter sends only non-read-only spec fields, so this list
     * IS the create/update payload shape the API's validateValues receives.
     */
    expect(
      spec.fields
        .filter((field) => !field.isReadOnly)
        .map((field) => field.logicalName),
    ).toEqual(["dd_serialNumber"]);
  });

  it("carries the custom-records permissions and the caller's capabilities", () => {
    const spec = buildCustomModuleRuntimeSpec(QA_ASSET);
    expect(spec.permissions).toEqual({
      read: "custom-records.read",
      create: "custom-records.create",
      update: "custom-records.write",
      delete: "custom-records.delete",
    });
    expect(spec.adapterCapabilities).toEqual(
      expect.objectContaining({
        disableCreate: false,
        disableEdit: false,
        disableDelete: true,
      }),
    );
  });

  it("maps customization field types onto runtime field types", () => {
    const spec = buildCustomModuleRuntimeSpec(VEHICLE);
    const typeOf = (name: string) =>
      spec.fields.find((field) => field.logicalName === name)?.dataType;
    expect(typeOf("pl_plate")).toBe("string");
    expect(typeOf("pl_notes")).toBe("multiline-string");
    expect(typeOf("pl_seats")).toBe("number");
    expect(typeOf("pl_fuel")).toBe("optionset");
    expect(typeOf("pl_active")).toBe("boolean");
    expect(
      spec.fields.find((field) => field.logicalName === "pl_fuel")?.options,
    ).toEqual([
      expect.objectContaining({ value: "petrol", label: "Petrol" }),
      expect.objectContaining({ value: "diesel", label: "Diesel" }),
    ]);
    expect(
      spec.fields.find((field) => field.logicalName === "pl_plate")
        ?.requirementLevel,
    ).toBe("required");
    expect(mapCustomFieldDataType("somethingNew")).toBe("string");
  });

  it("gives a second module its own independent routes and data path", () => {
    const vehicle = buildCustomModuleRuntimeSpec(VEHICLE);
    expect(vehicle.routeBase).toBe("/custom-modules/fleetVehicle");
    expect(vehicle.apiPath).toBe("/api/data/fleetVehicle");
    expect(vehicle.adapterCapabilities).toEqual(
      expect.objectContaining({
        disableCreate: true,
        disableEdit: true,
        disableDelete: true,
      }),
    );
  });
});

describe("buildCustomModuleViews", () => {
  it("builds list columns, filters and sort from the published view, dropping unpublished columns", () => {
    const [active] = buildCustomModuleViews(QA_ASSET);
    expect(active).toEqual(
      expect.objectContaining({
        logicalName: "activeQaAssets",
        viewId: "view-active",
        displayName: "Active QA Assets",
        columns: ["dd_serialNumber", "createdAt"],
        filters: [
          { fieldLogicalName: "dd_serialNumber", operator: "eq", value: "X" },
        ],
        defaultSort: [{ fieldLogicalName: "createdAt", direction: "desc" }],
      }),
    );
  });

  it("falls back to the module's fields for a view with no usable columns, and marks one default", () => {
    const views = buildCustomModuleViews(QA_ASSET);
    expect(views[1]?.columns).toEqual(["dd_serialNumber"]);
    expect(views.filter((view) => view.isDefault)).toHaveLength(1);
    expect(views[0]?.isDefault).toBe(true);
  });

  it("gives a module published without views one list of its fields", () => {
    const views = buildCustomModuleViews(VEHICLE);
    expect(views).toEqual([
      expect.objectContaining({
        displayName: "Vehicles",
        isDefault: true,
        columns: ["pl_plate", "pl_notes", "pl_seats", "pl_fuel", "pl_active"],
      }),
    ]);
  });
});

describe("buildCustomModuleForms and the route runtime", () => {
  it("maps the published main form and drops placements of columns not in the definition", () => {
    const [form] = buildCustomModuleForms(QA_ASSET);
    expect(form).toEqual(
      expect.objectContaining({
        id: "form-main",
        lifecycleState: "published",
        formType: "main",
        entityLogicalName: "qaAsset",
      }),
    );
    expect(
      form?.sections.flatMap((section) =>
        section.fields.map((field) => field.fieldLogicalName),
      ),
    ).toEqual(["dd_serialNumber"]);
  });

  it("skips non-record and malformed forms", () => {
    const forms = buildCustomModuleForms({
      ...QA_ASSET,
      forms: [
        {
          id: "card",
          formKey: "card",
          name: "Card",
          type: "card",
          layoutJson: QA_ASSET.forms[0]?.layoutJson,
        },
        {
          id: "broken",
          formKey: "broken",
          name: "Broken",
          type: "main",
          layoutJson: { tabs: "no" },
        },
      ],
    });
    expect(forms).toEqual([]);
  });

  it("renders the record page with the published form as the active form", () => {
    const { runtime, spec } = buildCustomModuleRuntime({
      definition: QA_ASSET,
      pageKind: "detail",
      recordId: "record-1",
      sessionUser: null,
    });
    expect(runtime.module.routeBase).toBe(spec.routeBase);
    expect(runtime.metadata.entity.logicalName).toBe("qaAsset");
    expect(resolveStandardActiveForm(runtime.metadata.forms, "")?.id).toBe(
      "form-main",
    );
    expect(runtime.metadata.views.map((view) => view.viewId)).toEqual([
      "view-active",
      "view-all",
    ]);
  });

  it("keeps a usable generated form for a module published without one", () => {
    const { runtime } = buildCustomModuleRuntime({
      definition: VEHICLE,
      pageKind: "create",
      sessionUser: null,
    });
    const active = resolveStandardActiveForm(runtime.metadata.forms, "");
    expect(active).not.toBeNull();
    expect(
      active?.sections.flatMap((section) =>
        section.fields.map((field) => field.fieldLogicalName),
      ),
    ).toEqual(expect.arrayContaining(["pl_plate", "pl_fuel"]));
  });

  it("ignores a published form with no placed fields and keeps the generated one", () => {
    // The main form a new table is saved with, before any column exists.
    const emptyMain = {
      id: "form-empty",
      formKey: "main",
      name: "QA Asset Main Form",
      type: "main",
      isDefault: true,
      layoutJson: {
        tabs: [
          {
            id: "summary",
            label: "Summary",
            sections: [{ id: "general", label: "General", fields: [] }],
          },
        ],
      },
    };
    const definition = { ...QA_ASSET, forms: [emptyMain] };
    expect(buildCustomModuleForms(definition)).toEqual([]);

    const { runtime } = buildCustomModuleRuntime({
      definition,
      pageKind: "create",
      sessionUser: null,
    });
    const active = resolveStandardActiveForm(runtime.metadata.forms, "");
    expect(
      active?.sections.flatMap((section) =>
        section.fields.map((field) => field.fieldLogicalName),
      ),
    ).toContain("dd_serialNumber");
  });

  it("drops a section whose only placements are columns not in the definition", () => {
    const [form] = buildCustomModuleForms({
      ...QA_ASSET,
      forms: [
        {
          id: "form-main",
          formKey: "main",
          name: "Main",
          type: "main",
          isDefault: true,
          layoutJson: {
            tabs: [
              {
                id: "general",
                label: "General",
                sections: [
                  {
                    id: "details",
                    label: "Details",
                    fields: [{ columnKey: "dd_serialNumber" }],
                  },
                  {
                    id: "drafts",
                    label: "Drafts",
                    fields: [{ columnKey: "dd_draftColumn" }],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(form?.sections.map((section) => section.fields.length)).toEqual([1]);
  });

  it("titles a record by its primary name field, falling back to the module name", () => {
    expect(
      resolveCustomModuleRecordTitle(QA_ASSET, { dd_serialNumber: "SN-1" }),
    ).toBe("SN-1");
    expect(resolveCustomModuleRecordTitle(QA_ASSET, {})).toBe("QA Asset");
  });
});
