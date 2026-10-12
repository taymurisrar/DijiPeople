import { getPlatformModuleDefinition } from "./platform-module-registry";
import { MODULES_WITH_DEPENDENCY_CHECK } from "./http-module-runtime-adapter";
import {
  canDeleteFromSubgrid,
  EMPTY_SELECTION,
  keepRefused,
  selectionSummary,
  subgridRowLabel,
  toggleRow,
  togglePage,
} from "./subgrid-selection";

const ADMIN = { roleKeys: ["PLATFORM_OWNER"], permissionKeys: ["platform.*"] };
const READER = { roleKeys: [], permissionKeys: ["contracts.read"] };

describe("subgrid selection and delete", () => {
  it("offers delete on Customer → Agreements to an administrator", () => {
    const contracts = getPlatformModuleDefinition("contracts");
    expect(contracts.capabilities.delete).toBe(true);
    expect(canDeleteFromSubgrid(contracts, ADMIN)).toBe(true);
    // The dialog asks the API what would block it before confirming.
    expect(MODULES_WITH_DEPENDENCY_CHECK.has("contracts")).toBe(true);
    expect(MODULES_WITH_DEPENDENCY_CHECK.has("plans")).toBe(true);
  });

  it("does not offer delete without the target's permission", () => {
    expect(
      canDeleteFromSubgrid(getPlatformModuleDefinition("contracts"), READER),
    ).toBe(false);
  });

  it("does not offer delete on a module that keeps its records", () => {
    expect(
      canDeleteFromSubgrid(getPlatformModuleDefinition("invoices"), ADMIN),
    ).toBe(false);
  });

  it("keeps selections from other pages when a page is toggled", () => {
    const pageOne = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const pageTwo = [{ id: "c", name: "C" }];
    let selection = togglePage(EMPTY_SELECTION, pageOne, true);
    selection = togglePage(selection, pageTwo, true);
    selection = togglePage(selection, pageOne, false);
    expect([...selection.keys()]).toEqual(["c"]);
    selection = toggleRow(selection, { id: "c" });
    expect(selection.size).toBe(0);
  });

  it("keeps only refused rows selected after a delete", () => {
    const selection = togglePage(
      EMPTY_SELECTION,
      [{ id: "a", name: "A" }, { id: "b", name: "B" }],
      true,
    );
    expect([...keepRefused(selection, ["b"]).keys()]).toEqual(["b"]);
  });

  it("labels rows by number and title, never by id", () => {
    expect(
      subgridRowLabel({ id: "x", contractNumber: "AGR-7", title: "MSA" }),
    ).toBe("AGR-7 — MSA");
    expect(
      subgridRowLabel({ id: "6f1d3c2a-8b4e-4f7a-9c1d-2e3f4a5b6c7d" }),
    ).toBe("Untitled record");
  });

  it("summarises the selection", () => {
    expect(selectionSummary(0, 4)).toBeNull();
    expect(selectionSummary(2, 4)).toBe("2 selected");
    expect(selectionSummary(4, 4)).toBe("All 4 selected");
  });
});
