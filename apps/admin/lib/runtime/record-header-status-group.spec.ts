import {
  getPlatformModuleDefinition,
  listPlatformModuleDefinitions,
} from "./platform-module-registry";
import { collectRuntimeLookupPaths } from "./runtime-lookups";

/**
 * The record header status group — Owner, Status, Sub-status.
 *
 * Two failure modes are worth pinning. The first is a slot that is *offered*
 * as editable while the API has no route to honour it, which produces a
 * control that looks live and 400s. The second is the opposite: a module whose
 * record genuinely carries an owner or a status and shows neither, which is
 * the state most of Platform Admin was in.
 */
describe("record header status group", () => {
  it("gives every module with a status column a status slot", () => {
    const withoutStatus = listPlatformModuleDefinitions()
      .filter((definition) => definition.key !== "dashboard")
      .filter((definition) =>
        definition.columns.some((column) => column.field === "status"),
      )
      .filter((definition) => !definition.recordHeader?.status)
      .map((definition) => definition.key);
    expect(withoutStatus).toEqual([]);
  });

  it("only marks a slot writable through a governed API route", () => {
    for (const definition of listPlatformModuleDefinitions()) {
      const header = definition.recordHeader;
      for (const slot of [header?.owner, header?.status, header?.subStatus]) {
        if (!slot?.write) continue;
        expect([definition.key, slot.field, slot.write]).toEqual([
          definition.key,
          slot.field,
          slot.write === "assign" ? "assign" : "change-status",
        ]);
      }
    }
  });

  it("restricts assignment to the modules bulkAssign can write", () => {
    const assignable = listPlatformModuleDefinitions()
      .filter((definition) => definition.recordHeader?.owner?.write === "assign")
      .map((definition) => definition.key)
      .sort();
    // `PlatformRuntimeService.bulkAssign` maps exactly these four onto a model.
    expect(assignable).toEqual([
      "customers",
      "leads",
      "partners",
      "support-cases",
    ]);
  });

  it("restricts status transitions to the modules changeStatus implements", () => {
    const transitional = listPlatformModuleDefinitions()
      .filter(
        (definition) => definition.recordHeader?.status?.write === "change-status",
      )
      .map((definition) => definition.key)
      .sort();
    expect(transitional).toEqual(["leads", "partners", "support-cases"]);
  });

  it("explains every read-only slot rather than leaving it looking broken", () => {
    for (const definition of listPlatformModuleDefinitions()) {
      const header = definition.recordHeader;
      for (const slot of [header?.owner, header?.status, header?.subStatus]) {
        if (!slot || slot.write) continue;
        expect([definition.key, slot.field, Boolean(slot.readOnlyReason)]).toEqual(
          [definition.key, slot.field, true],
        );
      }
    }
  });

  it("allowlists the owner lookup the header picker reads", () => {
    const allowed = collectRuntimeLookupPaths(listPlatformModuleDefinitions());
    for (const definition of listPlatformModuleDefinitions()) {
      const path = definition.recordHeader?.owner?.lookupPath;
      if (!path) continue;
      expect([definition.key, allowed.has(path)]).toEqual([definition.key, true]);
    }
  });

  it("gives Leads a sub-status optionset that depends on its status", () => {
    const subStatus = getPlatformModuleDefinition("leads").recordHeader
      ?.subStatus;
    expect(subStatus?.field).toBe("subStatus");
    expect(subStatus?.write).toBe("change-status");
    expect(
      subStatus?.optionsByStatus?.QUALIFIED?.map((option) => option.value),
    ).toContain("Ready for customer conversion");
    expect(
      subStatus?.optionsByStatus?.NEW?.map((option) => option.value),
    ).not.toContain("Ready for customer conversion");
  });

  it("resolves the owner through the relation, not the raw id", () => {
    for (const definition of listPlatformModuleDefinitions()) {
      const owner = definition.recordHeader?.owner;
      if (!owner) continue;
      // Without a display field the slot can only print the stored UUID, which
      // is exactly what the header exists to stop showing.
      expect([definition.key, Boolean(owner.displayValueField)]).toEqual([
        definition.key,
        true,
      ]);
    }
  });

  it("does not invent an owner for a plan, which has no owner column", () => {
    const header = getPlatformModuleDefinition("plans").recordHeader;
    expect(header?.owner).toBeUndefined();
    expect(header?.status?.field).toBe("publicationStatus");
    expect(header?.status?.write).toBeUndefined();
    expect(header?.subStatus?.field).toBe("salesModel");
  });
});
