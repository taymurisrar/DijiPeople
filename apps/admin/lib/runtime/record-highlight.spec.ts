import {
  PARTNER_ACCOUNT_STATUS_DEFINITIONS,
  PARTNER_PHASE_LABELS,
  PARTNER_STATUS_DEFINITIONS,
} from "@repo/config";
import { getPlatformModuleDefinition } from "./platform-module-registry";
import {
  resolveHighlightTitle,
  resolveRecordHighlights,
} from "./record-highlight";

/*
 * EXECPLAN-0055 D8 — the partner highlight header. Status is the derived
 * phase, Sub-status the exact lifecycle status, Account the portal-access
 * status — the three ADR-0026 says the record shows — all from the one shared
 * lifecycle table, so the header cannot disagree with what the API enforces.
 */
const partners = getPlatformModuleDefinition("partners");
const highlight = partners.highlight!;

function resolve(record: Record<string, unknown>) {
  return Object.fromEntries(
    resolveRecordHighlights(highlight, record).map((item) => [item.key, item]),
  );
}

describe("partner highlight header", () => {
  it("is declared, with the partner number first and the owner after it", () => {
    expect(highlight).toBeDefined();
    expect(highlight.items[0]?.field).toBe("partnerNumber");
    expect(highlight.owner?.after).toBe("partnerNumber");
    // Owner stays a header control the module can write through `assign`.
    expect(partners.recordHeader?.owner?.write).toBe("assign");
  });

  it.each(PARTNER_STATUS_DEFINITIONS.map((item) => [item.value, item]))(
    "reads %s as its phase and its exact sub-status",
    (_value, definition) => {
      const items = resolve({ status: definition.value });
      expect(items.phase?.display).toBe(PARTNER_PHASE_LABELS[definition.phase]);
      expect(items.subStatus?.display).toBe(definition.label);
    },
  );

  it("labels the account status and explains which action set it", () => {
    for (const account of PARTNER_ACCOUNT_STATUS_DEFINITIONS) {
      const item = resolve({ accountStatus: account.value }).accountStatus;
      expect(item?.display).toBe(account.label);
      expect(item?.hint).toBe(account.explanation);
    }
  });

  it("keeps status read-only with the reason the record header gives", () => {
    const phase = resolve({ status: "ACTIVE" }).phase;
    expect(phase?.hint).toBe(partners.recordHeader?.status?.readOnlyReason);
    expect(partners.recordHeader?.status?.write).toBeUndefined();
  });

  it("tones the phase by meaning, not spelling", () => {
    expect(resolve({ status: "ACTIVE" }).phase?.tone).toBe("success");
    expect(resolve({ status: "INACTIVE" }).phase?.tone).toBe("neutral");
    expect(resolve({ status: "SUSPENDED" }).phase?.tone).toBe("danger");
  });

  it("omits an unset partnership model rather than drawing an empty slot", () => {
    expect(resolve({ status: "DRAFT" }).partnershipModel).toBeUndefined();
    expect(
      resolve({ status: "DRAFT", partnershipModel: "RESELLER" })
        .partnershipModel?.display,
    ).toBe("Reseller");
  });

  it("shows a status the table does not know as itself instead of dropping it", () => {
    expect(resolve({ status: "SOMETHING_NEW" }).subStatus?.display).toBe(
      "Something New",
    );
  });

  it("titles the header with the partner name, falling back to the company", () => {
    expect(resolveHighlightTitle(highlight, { displayName: "Contoso" }, "Partner")).toBe("Contoso");
    expect(resolveHighlightTitle(highlight, { companyName: "Contoso Ltd" }, "Partner")).toBe("Contoso Ltd");
    expect(resolveHighlightTitle(highlight, {}, "Partner")).toBe("Partner");
  });
});
