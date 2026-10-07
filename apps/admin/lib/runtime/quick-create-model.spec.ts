import { getPlatformModuleDefinition } from "./platform-module-registry";
import type { RuntimeQuickCreateDefinition } from "./platform-runtime.types";
import {
  buildQuickCreatePayload,
  createSubmitGuard,
  mapQuickCreateErrors,
  quickCreateAvailability,
  quickCreateInitialValues,
  resolveQuickCreateFields,
  resolveQuickCreatePath,
} from "./quick-create-model";

/*
 * EXECPLAN-0055 D8 — the quick-create side panel's rules. The defects these
 * guard are the ones a side panel invites: a parent the operator could change,
 * a stray key that `forbidNonWhitelisted` refuses the whole create for, a blank
 * optional sent as "" (fails @IsUUID/@IsDateString), and a double click that
 * records two commissions.
 */
const partners = getPlatformModuleDefinition("partners");
const related = (key: string) =>
  partners.relatedRecords!.find((item) => item.key === key)!;
const childCreateFields = (key: Parameters<typeof getPlatformModuleDefinition>[0]) =>
  getPlatformModuleDefinition(key).forms.find((form) => form.key === "create")!
    .fields;

const commission = related("commissions").quickCreate!;
const contact = related("portalUsers").quickCreate!;
const referralLink = related("referralLinks").quickCreate!;
const PARTNER_ID = "11111111-1111-4111-8111-111111111111";

describe("quick-create field mapping", () => {
  it("reuses the commission module's own create fields, labels and controls", () => {
    const fields = resolveQuickCreateFields(
      commission,
      childCreateFields("commissions"),
    );
    const byKey = new Map(fields.map((field) => [field.key, field]));
    expect(byKey.get("baseAmount")).toEqual(
      expect.objectContaining({
        type: "currency",
        required: true,
        label: "Commissionable amount",
      }),
    );
    expect(byKey.get("commissionRate")?.type).toBe("percentage");
    // The currency is the same enabled-currency lookup the full form uses.
    expect(byKey.get("currencyCode")?.lookupPath).toBe(
      childCreateFields("commissions").find((f) => f.key === "currencyCode")
        ?.lookupPath,
    );
    expect(byKey.get("leadId")?.type).toBe("lookup");
  });

  it("never renders the parent field — the partner is the record it opened from", () => {
    const fields = resolveQuickCreateFields(
      { ...commission, fields: [...commission.fields, "partnerId"] },
      childCreateFields("commissions"),
    );
    expect(fields.map((field) => field.key)).not.toContain("partnerId");
  });

  it("fails loudly on a field key the child form does not declare", () => {
    expect(() =>
      resolveQuickCreateFields(
        { ...commission, fields: ["notAField"] },
        childCreateFields("commissions"),
      ),
    ).toThrow(/notAField/);
  });

  it("puts every field in one editable section", () => {
    const fields = resolveQuickCreateFields(contact);
    expect(fields.map((field) => field.key)).toEqual([
      "firstName",
      "lastName",
      "email",
    ]);
    expect(fields.every((field) => !field.readOnly && !field.tab)).toBe(true);
    expect(fields.every((field) => field.required)).toBe(true);
  });
});

describe("quick-create values and payload", () => {
  it("starts a commission in the partner's own currency", () => {
    expect(
      quickCreateInitialValues(commission, {
        currencyCode: "QAR",
        defaultCommissionRate: 12.5,
      }),
    ).toEqual({ currencyCode: "QAR" });
    expect(quickCreateInitialValues(commission, { currencyCode: "" })).toEqual(
      {},
    );
  });

  it("presets the parent id, overriding anything typed, under the runtime envelope", () => {
    const fields = resolveQuickCreateFields(
      commission,
      childCreateFields("commissions"),
    );
    const payload = buildQuickCreatePayload(
      commission,
      fields,
      {
        baseAmount: 1000,
        commissionRate: null,
        currencyCode: "QAR",
        leadId: "",
        description: "  Q3 referral  ",
        partnerId: "someone-else",
        status: "PAID",
        commissionAmount: 999999,
      },
      PARTNER_ID,
    );
    expect(payload).toEqual({
      values: {
        baseAmount: 1000,
        currencyCode: "QAR",
        description: "Q3 referral",
        partnerId: PARTNER_ID,
      },
    });
  });

  it("sends a contact as the body itself, with only its three fields", () => {
    const fields = resolveQuickCreateFields(contact);
    expect(
      buildQuickCreatePayload(
        contact,
        fields,
        {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          partnerId: PARTNER_ID,
          status: "ACTIVE",
        },
        PARTNER_ID,
      ),
    ).toEqual({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" });
  });

  it("posts to the declared create endpoint with the parent in the path", () => {
    expect(resolveQuickCreatePath(contact, PARTNER_ID)).toBe(
      `/api/partners/${PARTNER_ID}/contacts`,
    );
    expect(resolveQuickCreatePath(referralLink, PARTNER_ID)).toBe(
      `/api/partners/${PARTNER_ID}/referral-links`,
    );
    expect(resolveQuickCreatePath(commission, PARTNER_ID)).toBe(
      "/api/platform-runtime/commissions",
    );
  });
});

describe("quick-create availability", () => {
  it("offers referral links only for an active partner, saying why otherwise", () => {
    expect(quickCreateAvailability(referralLink, { status: "ACTIVE" })).toEqual({
      available: true,
    });
    expect(quickCreateAvailability(referralLink, { status: "DRAFT" })).toEqual({
      available: false,
      reason: "Referral links can be added once the partner is active.",
    });
    expect(quickCreateAvailability(contact, { status: "DRAFT" })).toEqual({
      available: true,
    });
  });
});

describe("duplicate submission guard", () => {
  it("lets one submission through at a time", () => {
    const guard = createSubmitGuard();
    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false);
    expect(guard.busy).toBe(true);
    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });
});

describe("server errors in the panel", () => {
  const fields = resolveQuickCreateFields(contact);

  it("puts a field error next to its field and keeps no generic banner", () => {
    expect(
      mapQuickCreateErrors(fields, "Email already in use", [
        { field: "email", message: "ada@example.com is already a contact." },
      ]),
    ).toEqual({
      fieldErrors: { email: "ada@example.com is already a contact." },
      message: null,
    });
  });

  it("surfaces an error for a field the panel does not show instead of losing it", () => {
    expect(
      mapQuickCreateErrors(fields, "Bad request", [
        { field: "partnerId", message: "partnerId must be a UUID" },
      ]),
    ).toEqual({ fieldErrors: {}, message: "partnerId must be a UUID" });
  });

  it("shows a domain error with no field as the panel message", () => {
    expect(
      mapQuickCreateErrors(
        fields,
        "Referral links are available only after the partner is active.",
      ),
    ).toEqual({
      fieldErrors: {},
      message: "Referral links are available only after the partner is active.",
    });
  });
});

describe("every declared quick create resolves", () => {
  it.each(
    partners
      .relatedRecords!.filter((item) => item.quickCreate)
      .map((item) => [item.key, item] as const),
  )("%s", (_key, relationship) => {
    const config = relationship.quickCreate as RuntimeQuickCreateDefinition;
    const fields = resolveQuickCreateFields(
      config,
      relationship.module ? childCreateFields(relationship.module) : [],
    );
    expect(fields.length).toBeGreaterThan(0);
    expect(config.actionLabel).toMatch(/^Add /);
  });
});
