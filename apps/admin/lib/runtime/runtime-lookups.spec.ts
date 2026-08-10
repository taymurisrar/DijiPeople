import type { PlatformModuleDefinition } from "./platform-runtime.types";
import {
  buildRuntimeLookupPath,
  collectRuntimeLookupPaths,
  mergeRuntimeLookupOptions,
  normalizeRuntimeLookupPayload,
} from "./runtime-lookups";

describe("runtime lookups", () => {
  it("collects lookup sources from every registry form without a parallel allowlist", () => {
    const definition = {
      forms: [
        { fields: [{ lookupPath: "/partners?pageSize=100" }] },
        { fields: [{ lookupPath: "/super-admin/plans" }, {}] },
      ],
    } as unknown as PlatformModuleDefinition;

    expect([...collectRuntimeLookupPaths([definition])]).toEqual([
      "/partners?pageSize=100",
      "/super-admin/plans",
    ]);
  });

  it("adds search without dropping fixed lookup query parameters", () => {
    expect(buildRuntimeLookupPath("/partners?pageSize=100", "Acme & Co")).toBe(
      "/partners?pageSize=100&search=Acme+%26+Co",
    );
  });

  it("normalizes labels and stable IDs from list responses", () => {
    expect(
      normalizeRuntimeLookupPayload({
        items: [
          { id: "partner-1", companyName: "Acme" },
          { id: "contract-1", contractNumber: "AGR-001" },
        ],
      }),
    ).toEqual([
      { value: "partner-1", label: "Acme" },
      { value: "contract-1", label: "AGR-001" },
    ]);
  });

  it("retains the current value when it is outside the searched page", () => {
    expect(
      mergeRuntimeLookupOptions([{ value: "new", label: "New" }], {
        value: "current",
        label: "Current",
      }),
    ).toEqual([
      { value: "current", label: "Current" },
      { value: "new", label: "New" },
    ]);
  });
});
