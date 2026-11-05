import {
  paymentFlowContextKey,
  resolvePaymentFlow,
  type PaymentFlowSelection,
} from "./payment-flow-selection";

describe("payment flow selection", () => {
  const pkrContext = paymentFlowContextKey({
    currency: "PKR",
    priceId: "price-pkr",
    providerKeys: ["SAFEPAY"],
  });
  const usdContext = paymentFlowContextKey({
    currency: "USD",
    priceId: "price-usd",
    providerKeys: ["STRIPE"],
  });

  it("keeps an explicit bank-transfer choice in the same PKR context", () => {
    expect(
      resolvePaymentFlow({
        contextKey: pkrContext,
        selection: {
          contextKey: pkrContext,
          flow: "BANK_TRANSFER_REQUEST",
        },
        bankTransferMarket: true,
        onlineCheckoutAvailable: true,
      }),
    ).toBe("BANK_TRANSFER_REQUEST");
  });

  it("does not carry a PKR bank-transfer choice into USD", () => {
    const selection: PaymentFlowSelection = {
      contextKey: pkrContext,
      flow: "BANK_TRANSFER_REQUEST",
    };

    expect(
      resolvePaymentFlow({
        contextKey: usdContext,
        selection,
        bankTransferMarket: false,
        onlineCheckoutAvailable: true,
      }),
    ).toBe("ONLINE");
  });

  it("does not carry an online choice to a PKR price with no live provider", () => {
    const bankOnlyContext = paymentFlowContextKey({
      currency: "PKR",
      priceId: "price-bank-only",
      providerKeys: [],
    });

    expect(
      resolvePaymentFlow({
        contextKey: bankOnlyContext,
        selection: { contextKey: pkrContext, flow: "ONLINE" },
        bankTransferMarket: true,
        onlineCheckoutAvailable: false,
      }),
    ).toBe("BANK_TRANSFER_REQUEST");
  });

  it("includes provider availability in the context identity", () => {
    expect(
      paymentFlowContextKey({
        currency: "PKR",
        priceId: "price-pkr",
        providerKeys: [],
      }),
    ).not.toBe(pkrContext);
  });
});
