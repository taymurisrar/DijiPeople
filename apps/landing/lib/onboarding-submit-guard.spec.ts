import { decideSubmit, WIZARD_STEPS } from "./onboarding-wizard";

/*
 * WS01: a native submit may arrive from any step of the one wrapping <form>
 * (Enter in an input, or Continue re-typed as submit). Only review may submit.
 */
describe("decideSubmit", () => {
  it("never submits from a step before review", () => {
    for (const step of WIZARD_STEPS.filter((s) => s !== "review")) {
      expect(decideSubmit({ step, missing: [], inFlight: false }).action).toBe(
        "advance",
      );
    }
  });

  it("blocks advancing while the step is incomplete", () => {
    expect(
      decideSubmit({
        step: "organization",
        missing: ["companyName"],
        inFlight: false,
      }).action,
    ).toBe("blocked");
  });

  it("submits only from review", () => {
    expect(
      decideSubmit({ step: "review", missing: [], inFlight: false }).action,
    ).toBe("submit");
  });

  it("ignores a second submission while one is in flight", () => {
    expect(
      decideSubmit({ step: "review", missing: [], inFlight: true }).action,
    ).toBe("ignore");
    expect(
      decideSubmit({ step: "agreements", missing: [], inFlight: true }).action,
    ).toBe("ignore");
  });
});
