import {
  buildCompensationMutationPayload,
  type PayComponentRecord,
} from "./compensation-runtime";

/**
 * REG-217 — BUG-0041 / ITEM-0050.
 *
 * The flat-to-structured translation used to live in
 * `app/api/payroll/compensations/route.ts`, together with a derivation of
 * `basicSalary` from "the first component with a non-empty amount" — a payroll
 * rule, in a route proxy, over a number that decides what an employee is paid,
 * with no test and no audit trail behind it.
 *
 * The invariants: **the translation moves the numbers the user entered and
 * invents none**, and **`basicSalary` is never derived**.
 */
describe("buildCompensationMutationPayload", () => {
  const AMOUNT: PayComponentRecord = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Housing",
    calculationMethod: "FIXED",
    isRecurring: true,
    displayOrder: 10,
  };
  const PERCENT: PayComponentRecord = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Bonus",
    calculationMethod: "PERCENTAGE",
    displayOrder: 20,
  };

  function run(
    values: Record<string, unknown>,
    mode: "create" | "update" = "create",
    components: PayComponentRecord[] = [AMOUNT, PERCENT],
  ) {
    // The adapter passes the sanitised payload and the raw values; for these
    // cases they carry the same fields.
    return buildCompensationMutationPayload(components, { ...values }, values, mode);
  }

  it("routes a fixed component to amount and a percentage component to percentage", () => {
    const payload = run({
      basicSalary: "5000.00",
      [`component_${AMOUNT.id}`]: "1200.00",
      [`component_${PERCENT.id}`]: "7.5",
    });

    expect(payload.components).toEqual([
      {
        payComponentId: AMOUNT.id,
        amount: "1200.00",
        isRecurring: true,
        displayOrder: 10,
      },
      { payComponentId: PERCENT.id, percentage: "7.5", displayOrder: 20 },
    ]);
  });

  it("passes basicSalary through exactly as entered", () => {
    expect(run({ basicSalary: "5000.00" }).basicSalary).toBe("5000.00");
  });

  it("never derives basicSalary from a component", () => {
    // The old proxy answered "1200.00" here. It now sends nothing, and the API
    // — which requires the field — returns a 400 naming it.
    const payload = run({ [`component_${AMOUNT.id}`]: "1200.00" });
    expect(payload).not.toHaveProperty("basicSalary");
  });

  it("never substitutes a zero for a missing basicSalary", () => {
    // The other half of the old fallback: `|| "0"`, which recorded an employee
    // as earning nothing rather than refusing the write.
    expect(run({})).not.toHaveProperty("basicSalary");
    expect(JSON.stringify(run({}))).not.toContain('"basicSalary"');
  });

  it("sends an empty component as undefined rather than an empty string", () => {
    const payload = run({ [`component_${AMOUNT.id}`]: "" }) as {
      components: Array<Record<string, unknown>>;
    };
    expect(payload.components[0].amount).toBeUndefined();
  });

  it("trims whitespace around an entered value", () => {
    const payload = run({ [`component_${AMOUNT.id}`]: "  900.00  " }) as {
      components: Array<Record<string, unknown>>;
    };
    expect(payload.components[0].amount).toBe("900.00");
  });

  it("accepts a numeric form value", () => {
    const payload = run({ [`component_${AMOUNT.id}`]: 900 }) as {
      components: Array<Record<string, unknown>>;
    };
    expect(payload.components[0].amount).toBe("900");
  });

  it("on create, includes every active component even when unvalued", () => {
    const payload = run({ basicSalary: "1.00" }) as {
      components: Array<Record<string, unknown>>;
    };
    expect(payload.components.map((c) => c.payComponentId)).toEqual([
      AMOUNT.id,
      PERCENT.id,
    ]);
  });

  it("on update, includes only the components the form actually submitted", () => {
    // Absence means "not on this form". Sending it as empty would clear a
    // component the user never saw.
    const payload = run(
      { [`component_${PERCENT.id}`]: "9" },
      "update",
    ) as { components: Array<Record<string, unknown>> };

    expect(payload.components).toEqual([
      { payComponentId: PERCENT.id, percentage: "9", displayOrder: 20 },
    ]);
  });

  it("strips the generated component_ keys from the payload", () => {
    const payload = run({
      basicSalary: "1.00",
      [`component_${AMOUNT.id}`]: "2.00",
    });
    expect(Object.keys(payload).some((key) => key.startsWith("component_"))).toBe(
      false,
    );
  });

  it("does not send back the API's derived totals", () => {
    const payload = run({
      basicSalary: "1.00",
      grossEarnings: "9999",
      totalDeductions: "10",
      estimatedNetPay: "9989",
    });
    expect(payload).not.toHaveProperty("grossEarnings");
    expect(payload).not.toHaveProperty("totalDeductions");
    expect(payload).not.toHaveProperty("estimatedNetPay");
  });

  it("keeps ordinary compensation fields untouched", () => {
    const payload = run({
      basicSalary: "1.00",
      employeeId: "33333333-3333-4333-8333-333333333333",
      currency: "PKR",
      effectiveDate: "2026-09-01",
      notes: "Annual review",
    });
    expect(payload.employeeId).toBe("33333333-3333-4333-8333-333333333333");
    expect(payload.currency).toBe("PKR");
    expect(payload.effectiveDate).toBe("2026-09-01");
    expect(payload.notes).toBe("Annual review");
  });

  it("sends an empty components array when the tenant has no pay components", () => {
    expect(run({ basicSalary: "1.00" }, "create", []).components).toEqual([]);
  });

  it("omits isRecurring and displayOrder when the component does not declare them", () => {
    const bare: PayComponentRecord = { id: "44444444-4444-4444-8444-444444444444" };
    const payload = run({ [`component_${bare.id}`]: "5" }, "create", [bare]) as {
      components: Array<Record<string, unknown>>;
    };
    expect(payload.components[0]).toEqual({
      payComponentId: bare.id,
      amount: "5",
    });
  });
});
