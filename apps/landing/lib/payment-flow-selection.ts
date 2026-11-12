/**
 * ONLINE — a card gateway the server offered.
 * BANK_TRANSFER — a real bank invoice, issued only when the server reports an
 *   approved receiving account for this price's market and currency.
 * BANK_TRANSFER_REQUEST — the assisted-sales fallback used while no receiving
 *   account is approved. It never produces an invoice or a payment.
 */
export type PaymentFlow = "ONLINE" | "BANK_TRANSFER" | "BANK_TRANSFER_REQUEST";

export type PaymentFlowSelection = {
  contextKey: string;
  flow: PaymentFlow;
};

export function paymentFlowContextKey(input: {
  currency: string;
  priceId: string | null;
  providerKeys: string[];
  /** Appended only when true, so every earlier key keeps its exact shape. */
  bankTransferLive?: boolean;
}) {
  return [
    input.currency.toUpperCase(),
    input.priceId ?? "no-price",
    [...input.providerKeys].sort().join(",") || "no-provider",
    ...(input.bankTransferLive ? ["bank-live"] : []),
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
  bankTransferLive?: boolean;
}): PaymentFlow {
  const selected =
    input.selection?.contextKey === input.contextKey
      ? input.selection.flow
      : null;

  // A live bank invoice replaces the assisted request: while the server can
  // issue a real invoice there is nothing to "request" from a salesperson.
  if (selected === "BANK_TRANSFER" && input.bankTransferLive) {
    return selected;
  }
  if (
    selected === "BANK_TRANSFER_REQUEST" &&
    input.bankTransferMarket &&
    !input.bankTransferLive
  ) {
    return selected;
  }
  if (selected === "ONLINE" && input.onlineCheckoutAvailable) {
    return selected;
  }
  // Bank transfer is the primary real-payment method where it is live.
  if (input.bankTransferLive) return "BANK_TRANSFER";
  if (input.bankTransferMarket && !input.onlineCheckoutAvailable) {
    return "BANK_TRANSFER_REQUEST";
  }
  return "ONLINE";
}
