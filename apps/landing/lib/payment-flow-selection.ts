export type PaymentFlow = "ONLINE" | "BANK_TRANSFER_REQUEST";

export type PaymentFlowSelection = {
  contextKey: string;
  flow: PaymentFlow;
};

export function paymentFlowContextKey(input: {
  currency: string;
  priceId: string | null;
  providerKeys: string[];
}) {
  return [
    input.currency.toUpperCase(),
    input.priceId ?? "no-price",
    [...input.providerKeys].sort().join(",") || "no-provider",
  ].join(":");
}

/**
 * Keep a buyer's explicit payment choice only while it still describes the
 * same price, market and server-offered providers. A choice made for one
 * market must never silently become the choice for another market.
 */
export function resolvePaymentFlow(input: {
  contextKey: string;
  selection: PaymentFlowSelection | null;
  bankTransferMarket: boolean;
  onlineCheckoutAvailable: boolean;
}): PaymentFlow {
  const selected =
    input.selection?.contextKey === input.contextKey
      ? input.selection.flow
      : null;

  if (selected === "BANK_TRANSFER_REQUEST" && input.bankTransferMarket) {
    return selected;
  }
  if (selected === "ONLINE" && input.onlineCheckoutAvailable) {
    return selected;
  }
  if (input.bankTransferMarket && !input.onlineCheckoutAvailable) {
    return "BANK_TRANSFER_REQUEST";
  }
  return "ONLINE";
}
