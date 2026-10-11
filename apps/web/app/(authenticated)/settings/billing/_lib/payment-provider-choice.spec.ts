import { chosenPaymentProvider } from "./payment-provider-choice";

const both = [
  { key: "SAFEPAY" as const, label: "Card (Safepay)" },
  { key: "STRIPE" as const, label: "Card (Stripe)" },
];

describe("chosenPaymentProvider", () => {
  it("sends nothing when the API offered no list", () => {
    expect(chosenPaymentProvider(undefined, "STRIPE")).toBeUndefined();
  });

  it("sends nothing when only one provider is offered", () => {
    expect(chosenPaymentProvider([both[1]!], "STRIPE")).toBeUndefined();
  });

  it("defaults to the first (server default) option", () => {
    expect(chosenPaymentProvider(both, undefined)).toBe("SAFEPAY");
  });

  it("honours the buyer's pick while it is offered", () => {
    expect(chosenPaymentProvider(both, "STRIPE")).toBe("STRIPE");
  });

  it("drops a pick the server no longer offers", () => {
    expect(
      chosenPaymentProvider(
        [both[0]!, { key: "SAFEPAY", label: "x" }],
        "STRIPE",
      ),
    ).toBe("SAFEPAY");
  });
});
