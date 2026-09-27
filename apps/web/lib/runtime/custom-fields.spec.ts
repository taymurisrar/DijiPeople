import {
  customFieldsPayload,
  withCustomFields,
  withCustomFieldValues,
  type CustomFieldDefinition,
} from "./custom-fields";
import { withTargetLookupOptions } from "./custom-lookup-adapter";
import {
  lookupLabel,
  lookupSourcePath,
  resolvableLookupTarget,
  toLookupOptions,
} from "./custom-lookup-options";
import type { ModuleDataAdapter } from "./module-data-adapter.types";
import type { FieldMetadata, FormMetadata } from "./metadata-runtime.types";
import { createStandardModuleDataAdapter } from "./modules/standard-module-data.adapter";
import { buildStandardModuleMetadataBundle } from "./modules/standard-module-runtime";
import { projectRuntimeSpec } from "./modules/standard-module-specs";

/*
 * TASK-0035 / ADR-0024 — the one set of web rules every system module's
 * record page uses for custom fields, and the lookup resolver behind BUG-3787.
 */

const costCenter: CustomFieldDefinition = {
  logicalName: "ad_costCenter",
  displayName: "Cost center",
  dataType: "select",
  required: false,
  readOnly: false,
  isPrimaryName: false,
  maxLength: null,
  lookupTargetTableKey: null,
  options: [{ value: "CC1", label: "CC 1" }],
};

describe("withCustomFields", () => {
  const base = buildStandardModuleMetadataBundle(projectRuntimeSpec);

  it("is the identity without custom fields", () => {
    expect(withCustomFields(base, [])).toBe(base);
  });

  it("adds marked fields and places them on every form", () => {
    const bundle = withCustomFields(base, [costCenter]);
    const field = bundle.entity.fields.find(
      (item) => item.logicalName === "ad_costCenter",
    );
    expect(field).toMatchObject({ isCustomField: true, dataType: "optionset" });
    for (const form of bundle.forms) {
      expect(
        form.sections
          .find((section) => section.id === "custom-fields")
          ?.fields.map((item) => item.fieldLogicalName),
      ).toEqual(["ad_costCenter"]);
    }
  });

  it("leaves a field the form designer already placed where it is", () => {
    const placed: FormMetadata = {
      ...base.forms[0],
      sections: [
        ...base.forms[0].sections,
        {
          id: "designed",
          label: "Designed",
          order: 1,
          layout: "single-column",
          fields: [{ fieldLogicalName: "ad_costCenter", order: 1 }],
        },
      ],
    };
    const bundle = withCustomFields({ ...base, forms: [placed] }, [costCenter]);
    expect(
      bundle.forms[0].sections.some(
        (section) => section.id === "custom-fields",
      ),
    ).toBe(false);
  });
});

describe("values and payload", () => {
  it("lifts customFields to the top level and keeps the original", () => {
    expect(
      withCustomFieldValues({
        id: "r1",
        customFields: { ad_costCenter: "CC1" },
      }),
    ).toEqual({
      id: "r1",
      ad_costCenter: "CC1",
      customFields: { ad_costCenter: "CC1" },
    });
    const plain = { id: "r1" };
    expect(withCustomFieldValues(plain)).toBe(plain);
  });

  it("sends only the fields marked custom, not every key with an underscore", () => {
    const fields = [
      { logicalName: "ad_costCenter", isCustomField: true },
      { logicalName: "component_basic" },
    ] as FieldMetadata[];
    expect(
      customFieldsPayload(
        { ad_costCenter: "CC1", component_basic: 5, name: "x" },
        fields,
      ),
    ).toEqual({ ad_costCenter: "CC1" });
    expect(customFieldsPayload({ name: "x" }, fields)).toBeUndefined();
  });

  it("the standard adapter adds customFields to a save only when the form has some", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      bodies.push(
        JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      );
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "p1" }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      const adapter = createStandardModuleDataAdapter(projectRuntimeSpec);
      const plain = buildStandardModuleMetadataBundle(projectRuntimeSpec);
      const withFields = withCustomFields(plain, [costCenter]);
      await adapter.create({ metadata: plain } as never, {
        name: "P",
        ad_costCenter: "CC1",
      });
      await adapter.create({ metadata: withFields } as never, {
        name: "P",
        ad_costCenter: "CC1",
      });
      expect(bodies[0]).not.toHaveProperty("customFields");
      expect(bodies[1].customFields).toEqual({ ad_costCenter: "CC1" });
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("lookup options by target table key (BUG-3787)", () => {
  const lookup = (overrides: Partial<FieldMetadata>) =>
    ({
      logicalName: "ad_link",
      dataType: "lookup",
      lookupTargets: [{ entityLogicalName: "misAsset" }],
      ...overrides,
    }) as FieldMetadata;

  it("reads a custom module through the data API, a system table through its own route", () => {
    expect(lookupSourcePath({ entityLogicalName: "misAsset" })).toBe(
      "/api/data/misAsset?pageSize=200",
    );
    expect(
      lookupSourcePath({
        entityLogicalName: "departments",
        isSystemTable: true,
      }),
    ).toBe("/api/departments");
    expect(
      lookupSourcePath({
        entityLogicalName: "rolePermissions",
        isSystemTable: true,
      }),
    ).toBeNull();
  });

  it("resolves custom fields always, other lookups only when the adapter cannot", () => {
    expect(
      resolvableLookupTarget(lookup({ isCustomField: true }), true),
    ).not.toBeNull();
    expect(resolvableLookupTarget(lookup({}), true)).toBeNull();
    expect(resolvableLookupTarget(lookup({}), false)).not.toBeNull();
    expect(
      resolvableLookupTarget(lookup({ dataType: "string" }), false),
    ).toBeNull();
  });

  it("labels rows by their name, and a custom module's row by its first text column", () => {
    expect(lookupLabel({ id: "1", fullName: "Sara Ahmed" })).toBe("Sara Ahmed");
    expect(lookupLabel({ id: "1", firstName: "Sara", lastName: "Ahmed" })).toBe(
      "Sara Ahmed",
    );
    expect(lookupLabel({ id: "1", mis_tag: "LAPTOP-7" })).toBe("LAPTOP-7");
    expect(
      lookupLabel({ id: "1", mis_tag: "x", mis_name: "Dell" }, "mis_name"),
    ).toBe("Dell");
    expect(
      toLookupOptions(
        {
          items: [
            { id: "a", name: "Finance" },
            { id: "b", name: "Sales" },
          ],
        },
        { search: "fin" },
      ),
    ).toEqual([{ id: "a", name: "Finance" }]);
  });

  it("the page wrapper resolves target lookups and leaves every other field as it was", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: "a1", mis_tag: "LAPTOP-7" }] }),
    })) as unknown as typeof fetch;
    try {
      const base = {} as ModuleDataAdapter;
      const custom = lookup({});
      const system = lookup({ logicalName: "departmentId", lookupTargets: [] });
      expect(withTargetLookupOptions(base, [system])).toBe(base);

      const wrapped = withTargetLookupOptions(base, [custom, system], {
        departmentId: [{ id: "d1", name: "Finance" }],
      });
      await expect(
        wrapped.getLookupOptions!({} as never, custom, {}),
      ).resolves.toEqual([{ id: "a1", name: "LAPTOP-7" }]);
      await expect(
        wrapped.getLookupOptions!({} as never, system, {}),
      ).resolves.toEqual([{ id: "d1", name: "Finance" }]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
