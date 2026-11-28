import {
  defaultUnitKey,
  definitionFromDrafts,
  draftsFromDefinition,
  emptyWorkType,
  isoFromDateInput,
  keyFromName,
  messageFromErrorBody,
  unitsForMode,
  validateDrafts,
  type WorkUnit,
} from "./work-profile-form";

const units: WorkUnit[] = [
  { id: "1", key: "hours", name: "Hours", kind: "DURATION", isActive: true },
  { id: "2", key: "calls", name: "Calls", kind: "COUNT", isActive: true },
  { id: "3", key: "duty", name: "Duty", kind: "DUTY_COMPLETION", isActive: true },
  { id: "4", key: "old", name: "Old", kind: "COUNT", isActive: false },
];

const stored = {
  workTypes: [
    {
      key: "call-handled",
      name: "Call handled",
      kind: "TRANSACTION",
      unitKey: "calls",
      measurementMode: "QUANTITY",
      standardEffortMinutes: 6,
      complexityBands: [{ key: "simple", name: "Simple", multiplier: 1 }],
      quality: { samplePercent: 10, requiresVerification: true },
    },
  ],
};

describe("work profile form", () => {
  it("round-trips a stored definition through the editable rows", () => {
    const drafts = draftsFromDefinition(stored);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      key: "call-handled",
      measurementMode: "QUANTITY",
      standardEffortMinutes: 6,
      samplePercent: 10,
      requiresVerification: true,
    });
    expect(definitionFromDrafts(drafts)).toEqual(stored);
  });

  it("tolerates malformed stored JSON", () => {
    expect(draftsFromDefinition(null)).toEqual([]);
    expect(draftsFromDefinition({ workTypes: "x" })).toEqual([]);
    expect(draftsFromDefinition({ workTypes: [1, { kind: "NOPE" }] })).toHaveLength(1);
  });

  it("never sends a per-unit standard for timed work, and omits empty optional parts", () => {
    const payload = definitionFromDrafts([
      {
        ...emptyWorkType(),
        key: "shift",
        name: "Shift",
        unitKey: "hours",
        measurementMode: "TIMED",
        standardEffortMinutes: 30,
      },
    ]);
    expect(payload.workTypes[0]).toEqual({
      key: "shift",
      name: "Shift",
      kind: "TASK",
      unitKey: "hours",
      measurementMode: "TIMED",
    });
  });

  it("offers only active units a mode can use, keeping the current pick", () => {
    expect(unitsForMode(units, "TIMED").map((u) => u.key)).toEqual(["hours"]);
    expect(unitsForMode(units, "QUANTITY").map((u) => u.key)).toEqual(["calls"]);
    expect(unitsForMode(units, "QUANTITY", "old").map((u) => u.key)).toEqual([
      "calls",
      "old",
    ]);
    expect(defaultUnitKey(units, "COMPLETION")).toBe("duty");
    expect(defaultUnitKey([], "COMPLETION")).toBe("");
  });

  it("catches the obvious problems before a round trip", () => {
    const bad = [
      { ...emptyWorkType(), key: "A", name: "", unitKey: "hours" },
      {
        ...emptyWorkType(),
        key: "dup",
        name: "Dup",
        unitKey: "calls",
        standardEffortMinutes: 0,
      },
      { ...emptyWorkType(), key: "dup", name: "Dup 2", unitKey: "calls" },
    ];
    const text = validateDrafts(bad, units).join(" | ");
    expect(text).toMatch(/key must be/);
    expect(text).toMatch(/name is required/);
    expect(text).toMatch(/cannot use a Duration unit/);
    expect(text).toMatch(/above 0/);
    expect(text).toMatch(/used twice/);
    expect(validateDrafts([], units)).toEqual(["Add at least one work type."]);
    expect(
      validateDrafts(
        [{ ...emptyWorkType(), key: "ok-1", name: "Ok", unitKey: "calls" }],
        units,
      ),
    ).toEqual([]);
  });

  it("suggests a valid key from a name and converts date inputs to UTC", () => {
    expect(keyFromName("  Ward Round / Night ")).toBe("ward-round-night");
    expect(isoFromDateInput("2026-03-01")).toBe("2026-03-01T00:00:00.000Z");
  });

  it("reads the API error message in either shape", () => {
    expect(messageFromErrorBody({ message: "Nope" }, "x")).toBe("Nope");
    expect(messageFromErrorBody({ message: ["a", "b"] }, "x")).toBe("a b");
    expect(messageFromErrorBody(null, "fallback")).toBe("fallback");
  });
});
