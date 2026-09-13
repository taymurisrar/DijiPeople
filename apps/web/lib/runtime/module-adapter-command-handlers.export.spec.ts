import type { CommandExecutionContext } from "./command-runtime.types";
import type { FieldMetadata, FormMetadata } from "./metadata-runtime.types";
import { buildAdapterCommandHandlers } from "./module-adapter-command-handlers";
import type { ModuleRuntimeContext } from "./module-runtime.types";

/*
 * BUG-3498 — Export on an employee record wrote the Owner, Reporting Manager
 * and Emergency Contact Relation Type rows as UUIDs. `displayExportValue` read
 * the raw value stored under each field's logical name, which for a lookup is
 * the referenced id, and never consulted the display names the record page
 * already renders for the same fields.
 */

const OWNER_ID = "e0302ffb-4c1e-4f37-9b0a-6c2d1f3e8a11";
const MANAGER_ID = "7b1d9a64-2f0c-4d8e-a5b3-19c6e2d4f701";
const RELATION_ID = "3f6a2c18-9d4b-4e71-8c05-b2e7d9a1c360";
const LOCATION_ID = "a9e4b7c2-6d13-48f5-9a20-5c8b1e3d7f94";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function field(
  logicalName: string,
  displayName: string,
  dataType: FieldMetadata["dataType"],
  extra: Partial<FieldMetadata> = {},
): FieldMetadata {
  return {
    id: logicalName,
    logicalName,
    displayName,
    version: "1",
    lifecycleState: "published",
    layer: "system",
    entityLogicalName: "employee",
    dataType,
    ...extra,
  } as FieldMetadata;
}

const runtime = {
  module: { key: "employees", routeBase: "/employees", label: "Employees" },
  recordId: "emp-1",
  metadata: {
    entity: {
      logicalName: "employee",
      primaryNameField: "fullName",
      ownerField: "ownerId",
      statusField: "employmentStatus",
      fields: [
        field("fullName", "Full Name", "string"),
        field("ownerId", "Owner", "lookup"),
        field("employmentStatus", "Employment Status", "optionset", {
          options: [{ value: "ACTIVE", label: "Active" }],
        } as Partial<FieldMetadata>),
        field("reportingManagerEmployeeId", "Reporting Manager", "lookup"),
        field(
          "emergencyContactRelationTypeId",
          "Emergency Contact Relation Type",
          "lookup",
        ),
        field("locationId", "Location", "lookup"),
        field("isRemote", "Remote", "boolean"),
        field("hireDate", "Hire Date", "date"),
      ],
    },
  },
} as unknown as ModuleRuntimeContext;

const form = {
  id: "form-1",
  logicalName: "employee.main",
  displayName: "Main",
  version: "1",
  lifecycleState: "published",
  layer: "system",
  entityLogicalName: "employee",
  mode: "edit",
  sections: [
    {
      id: "s1",
      label: "Details",
      order: 1,
      layout: "single-column",
      fields: [
        { fieldLogicalName: "reportingManagerEmployeeId", order: 1 },
        { fieldLogicalName: "emergencyContactRelationTypeId", order: 2 },
        { fieldLogicalName: "locationId", order: 3 },
        { fieldLogicalName: "isRemote", order: 4 },
        { fieldLogicalName: "hireDate", order: 5 },
      ],
    },
  ],
} as FormMetadata;

const record = {
  id: "emp-1",
  fullName: "Zaid Ahmed",
  ownerId: OWNER_ID,
  employmentStatus: "ACTIVE",
  reportingManagerEmployeeId: MANAGER_ID,
  emergencyContactRelationTypeId: RELATION_ID,
  // No display name is known for this one.
  locationId: LOCATION_ID,
  isRemote: false,
  hireDate: "2024-03-01",
};

async function exportCsv(
  lookupDisplayValues?: Readonly<Record<string, string>>,
) {
  let csv = "";
  const handlers = buildAdapterCommandHandlers({
    downloadFile: (file) => {
      csv = String(file);
    },
    form,
    lookupDisplayValues,
  });

  await handlers["record.export"]({
    runtime,
    command: { key: "record.export" },
    record,
    recordId: "emp-1",
  } as unknown as CommandExecutionContext);

  return csv;
}

describe("record export of lookup fields", () => {
  it("writes the display names the record page shows", async () => {
    const csv = await exportCsv({
      ownerId: "Taimur Khan",
      reportingManagerEmployeeId: "Omar Haddad",
      emergencyContactRelationTypeId: "Spouse",
    });

    expect(csv).toContain('"Status Group","Owner","Taimur Khan"');
    expect(csv).toContain('"Details","Reporting Manager","Omar Haddad"');
    expect(csv).toContain(
      '"Details","Emergency Contact Relation Type","Spouse"',
    );
  });

  it("never writes a bare id for a populated lookup", async () => {
    const csv = await exportCsv({ ownerId: "Taimur Khan" });

    expect(csv).not.toMatch(UUID);
    expect(csv).toContain('"Details","Location",""');
  });

  it("keeps option sets, booleans and dates as they were", async () => {
    const csv = await exportCsv({});

    expect(csv).toContain('"Status Group","Employment Status","Active"');
    expect(csv).toContain('"Details","Remote","No"');
    expect(csv).toContain('"Details","Hire Date","2024-03-01"');
  });
});
