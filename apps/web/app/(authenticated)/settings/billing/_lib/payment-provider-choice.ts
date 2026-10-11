export type PaymentProviderKey = "STRIPE" | "SAFEPAY";

export type PaymentProviderOption = { key: PaymentProviderKey; label: string };

/**
 * The provider to send with a checkout, or undefined to send none.
 *
 * Undefined whenever there was no real choice — no list (an older API) or a
 * single provider — so the API keeps routing by currency exactly as it did
 * before buyers could choose. With a choice, the buyer's pick wins only while
 * it is still one of the offered options; otherwise the API's default (listed
 * first) is used, so a stale selection can never send a provider the server
 * stopped offering.
 */
export function chosenPaymentProvider(
  options: PaymentProviderOption[] | undefined,
  selected: PaymentProviderKey | undefined,
): PaymentProviderKey | undefined {
  if (!options || options.length < 2) return undefined;
  if (selected && options.some((option) => option.key === selected)) {
    return selected;
  }
  return options[0]?.key;
}
