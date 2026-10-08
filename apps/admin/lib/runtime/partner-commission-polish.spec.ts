import { existsSync } from "node:fs";
import { join } from "node:path";
import { getPlatformModuleDefinition } from "./platform-module-registry";
import { isRuntimeFieldVisible } from "./field-visibility";
import {
  quickCreateInitialValues,
  resolveQuickCreateFields,
} from "./quick-create-model";
import {
  RELATED_PANEL_CLASS,
  ROW_ACTIONS_COLUMN_LAYOUT,
  relatedCellValue,
} from "./related-records-model";
import {
  bindRuntimeLookupPath,
  collectRuntimeLookupPaths,
  lookupPathPlaceholders,
  resolveAllowedLookupSource,
  resolveLookupBindings,
} from "./runtime-lookups";
import { listPlatformModuleDefinitions } from "./platform-module-registry";
import { buildLookupRecordHref } from "./lookup-record-href";

/*
 * TASK-0037 browser pass. Five polish defects on the partner and commission
 * records, each fixed where its cause was generic.
 */
const partners = getPlatformModuleDefinition("partners");
const commissions = getPlatformModuleDefinition("commissions");
const partnerDetail = partners.forms.find((form) => form.key === "detail")!;
const commissionForm = (key: "create" | "detail") =>
  commissions.forms.find((form) => form.key === key)!;
const commissionField = (key: string, form: "create" | "detail" = "detail") =>
  commissionForm(form).fields.find((field) => field.key === key)!;
const PARTNER_ID = "6f1c2a0e-6c55-4a43-9a51-1f4f2b6f9d10";

describe("P1: a console-created partner has no empty Application details card", () => {
  const applicationFields = partnerDetail.fields.filter(
    (field) => field.section === "application",
  );

  it("declares every application field read-only and hidden when empty", () => {
    expect(applicationFields.map((field) => field.key).sort()).toEqual([
      "applicationSnapshot",
      "applicationSource",
      "applicationSubmittedAt",
    ]);
    for (const field of applicationFields) {
      expect(field.readOnly).toBe(true);
      expect(field.hideWhenEmpty).toBe(true);
    }
  });

  it("leaves no visible field in the section, in read and edit mode", () => {
    const consolePartner = {
      applicationSource: null,
      applicationSubmittedAt: null,
      applicationSnapshot: {},
    };
    for (const mode of ["read", "edit"] as const)
      expect(
        applicationFields.filter((field) =>
          isRuntimeFieldVisible(field, consolePartner, mode),
        ),
      ).toEqual([]);
  });

  it("still shows the details a partner application recorded", () => {
    const applied = {
      applicationSource: "partner-inquiry",
      applicationSubmittedAt: "2026-10-01T09:00:00.000Z",
      applicationSnapshot: { companyName: "Contoso" },
    };
    expect(
      applicationFields.filter((field) =>
        isRuntimeFieldVisible(field, applied, "read"),
      ),
    ).toHaveLength(3);
  });
});

describe("P2: wide subgrids scroll inside their card with commands in view", () => {
  it("lets the card shrink to its track so the table scrolls", () => {
    expect(RELATED_PANEL_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["min-w-0", "overflow-hidden"]),
    );
  });

  it("pins the commands column to the right edge on its own background", () => {
    for (const className of [
      ROW_ACTIONS_COLUMN_LAYOUT.headerClassName,
      ROW_ACTIONS_COLUMN_LAYOUT.cellClassName,
    ]) {
      const classes = className.split(" ");
      expect(classes).toEqual(expect.arrayContaining(["sticky", "right-0"]));
      // Not `bg-inherit`: an unhovered row is transparent and the scrolled
      // columns would show through the commands.
      expect(classes.some((item) => /^bg-(white|slate-50)$/.test(item))).toBe(
        true,
      );
    }
    expect(ROW_ACTIONS_COLUMN_LAYOUT.cellClassName).toContain(
      "whitespace-nowrap",
    );
  });
});

describe("P3: commission Lead and Customer pickers list the partner's own records", () => {
  it("scopes both lookups to the commission's partner", () => {
    expect(lookupPathPlaceholders(commissionField("leadId").lookupPath)).toEqual(
      ["partnerId"],
    );
    expect(
      lookupPathPlaceholders(commissionField("customerAccountId").lookupPath),
    ).toEqual(["partnerId"]);
    expect(commissionField("leadId").lookupPath).toContain(
      "partnerId={partnerId}",
    );
    expect(commissionField("customerAccountId").lookupPath).toContain(
      "originatingPartnerId={partnerId}",
    );
  });

  it("binds the partner from the form and loads nothing without one", () => {
    const path = commissionField("leadId").lookupPath;
    expect(resolveLookupBindings(path, { partnerId: PARTNER_ID })).toEqual({
      partnerId: PARTNER_ID,
    });
    expect(resolveLookupBindings(path, {})).toBeNull();
    expect(resolveLookupBindings(path, { partnerId: "" })).toBeNull();
    expect(resolveLookupBindings("/partners?pageSize=100", {})).toEqual({});
  });

  it("seeds the quick-create values with the parent so the picker can bind", () => {
    const quickCreate = partners.relatedRecords!.find(
      (item) => item.key === "commissions",
    )!.quickCreate!;
    const values = quickCreateInitialValues(
      quickCreate,
      { currencyCode: "QAR" },
      PARTNER_ID,
    );
    expect(values).toEqual({ currencyCode: "QAR", partnerId: PARTNER_ID });
    const fields = resolveQuickCreateFields(
      quickCreate,
      commissionForm("create").fields,
    );
    // The parent is still never offered as a field to change.
    expect(fields.some((field) => field.key === "partnerId")).toBe(false);
    for (const key of ["leadId", "customerAccountId"]) {
      const field = fields.find((item) => item.key === key)!;
      expect(resolveLookupBindings(field.lookupPath, values)).toEqual({
        partnerId: PARTNER_ID,
      });
    }
  });

  it("lets the lookup route call only an allowlisted template with id-shaped bindings", () => {
    const allowed = collectRuntimeLookupPaths(listPlatformModuleDefinitions());
    const template = commissionField("leadId").lookupPath!;
    expect(allowed.has(template)).toBe(true);
    const params = (entries: Record<string, string>) =>
      new URLSearchParams(entries);
    expect(
      resolveAllowedLookupSource(
        allowed,
        params({ path: template, "bind.partnerId": PARTNER_ID }),
      ),
    ).toBe(`/super-admin/leads?pageSize=100&partnerId=${PARTNER_ID}`);
    // Unbound, injected, or not allowlisted: refused.
    expect(
      resolveAllowedLookupSource(allowed, params({ path: template })),
    ).toBeNull();
    expect(
      resolveAllowedLookupSource(
        allowed,
        params({ path: template, "bind.partnerId": "x&pageSize=100000" }),
      ),
    ).toBeNull();
    expect(
      resolveAllowedLookupSource(
        allowed,
        params({ path: "/super-admin/leads?partnerId=" + PARTNER_ID }),
      ),
    ).toBeNull();
    // A plain allowlisted path is unchanged.
    expect(
      resolveAllowedLookupSource(
        allowed,
        params({ path: "/partners?pageSize=100" }),
      ),
    ).toBe("/partners?pageSize=100");
    expect(bindRuntimeLookupPath("/a?b={c}", { c: "../x" })).toBeNull();
  });

  it("still links a chosen lead and customer to their records", () => {
    expect(buildLookupRecordHref(commissionField("leadId"), "lead-1")).toBe(
      "/leads/lead-1",
    );
    expect(
      buildLookupRecordHref(commissionField("customerAccountId"), "cust-1"),
    ).toBe("/customers/cust-1");
  });
});

describe("P4: the commission record names its lead and customer and labels its status", () => {
  it("reads the display labels the API returns beside the ids", () => {
    expect(commissionField("leadId").displayValueField).toBe("leadLabel");
    expect(commissionField("customerAccountId").displayValueField).toBe(
      "customerLabel",
    );
  });

  it("renders status through its option labels", () => {
    const status = commissionField("status");
    expect(status.readOnly).toBe(true);
    expect(status.renderAs).toBe("status");
    expect(status.options).toEqual([
      { value: "PENDING", label: "Pending" },
      { value: "APPROVED", label: "Approved" },
      { value: "PAYABLE", label: "Payable" },
      { value: "PAID", label: "Paid" },
      { value: "VOID", label: "Void" },
    ]);
  });
});

describe("P5: the partner commission grid opens the commission", () => {
  const grid = partners.relatedRecords!.find(
    (item) => item.key === "commissions",
  )!;

  it("links the commission number to /commissions/:id", () => {
    const numberColumn = grid.columns!.find(
      (column) => column.field === "commissionNumber",
    )!;
    expect(
      relatedCellValue(
        { id: "com-1", commissionNumber: "COM-000001" },
        numberColumn,
      ),
    ).toEqual({
      kind: "text",
      text: "COM-000001",
      href: "/commissions/com-1",
    });
  });

  it("targets a module whose record page exists", () => {
    expect(grid.module).toBe("commissions");
    expect(commissions.routeBase).toBe("/commissions");
    expect(
      existsSync(
        join(
          __dirname,
          "../../app/(internal)/commissions/[commissionId]/page.tsx",
        ),
      ),
    ).toBe(true);
  });
});
