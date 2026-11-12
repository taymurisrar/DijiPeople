import {
  paymentFlowContextKey,
  resolvePaymentFlow,
} from "./payment-flow-selection";

/**
 * A live bank transfer (the server reports an approved receiving account) is
 * the primary PKR payment method and replaces the assisted-sales request. These
 * pin that it can never be reached from client state alone.
 */
describe("payment flow selection with a live bank transfer", () => {
  const live = paymentFlowContextKey({
    currency: "PKR",
    priceId: "price-pkr",
    providerKeys: [],
    bankTransferLive: true,
  });

  it("defaults to the live bank transfer when nothing else can collect", () => {
    expect(
      resolvePaymentFlow({
        contextKey: live,
        selection: null,
        bankTransferMarket: true,
        onlineCheckoutAvailable: false,
        bankTransferLive: true,
      }),
    ).toBe("BANK_TRANSFER");
  });

  it("is also the default when a card gateway is offered too", () => {
    expect(
      resolvePaymentFlow({
        contextKey: live,
        selection: null,
        bankTransferMarket: true,
        onlineCheckoutAvailable: true,
        bankTransferLive: true,
      }),
    ).toBe("BANK_TRANSFER");
  });

  it("honours an explicit online choice while bank transfer is live", () => {
    expect(
      resolvePaymentFlow({
        contextKey: live,
        selection: { contextKey: live, flow: "ONLINE" },
        bankTransferMarket: true,
        onlineCheckoutAvailable: true,
        bankTransferLive: true,
      }),
    ).toBe("ONLINE");
  });

  it("never lets a stored live-bank choice survive the server withdrawing it", () => {
    const withdrawn = paymentFlowContextKey({
      currency: "PKR",
      priceId: "price-pkr",
      providerKeys: [],
    });
    expect(withdrawn).not.toBe(live);
    expect(
      resolvePaymentFlow({
        contextKey: withdrawn,
        selection: { contextKey: live, flow: "BANK_TRANSFER" },
        bankTransferMarket: true,
        onlineCheckoutAvailable: false,
        bankTransferLive: false,
      }),
    ).toBe("BANK_TRANSFER_REQUEST");
  });

  it("refuses a BANK_TRANSFER selection when the server did not report it live", () => {
    expect(
      resolvePaymentFlow({
        contextKey: live,
        selection: { contextKey: live, flow: "BANK_TRANSFER" },
        bankTransferMarket: true,
        onlineCheckoutAvailable: false,
        bankTransferLive: false,
      }),
    ).toBe("BANK_TRANSFER_REQUEST");
  });

  it("is never reached in a non-PKR context without a server report", () => {
    expect(
      resolvePaymentFlow({
        contextKey: "USD:price-usd:STRIPE",
        selection: {
          contextKey: "USD:price-usd:STRIPE",
          flow: "BANK_TRANSFER",
        },
        bankTransferMarket: false,
        onlineCheckoutAvailable: true,
        bankTransferLive: false,
      }),
    ).toBe("ONLINE");
  });

  it("keeps the earlier context-key shape when the bank is not live", () => {
    expect(
      paymentFlowContextKey({
        currency: "pkr",
        priceId: "p",
        providerKeys: ["SAFEPAY"],
      }),
    ).toBe("PKR:p:SAFEPAY");
  });
});
