/**
 * The commission and currency an agreement is created with (ADR-0026 D3,
 * EXECPLAN-0055 WP-06).
 *
 * An agreement linked to a partner used to store no commission of its own;
 * `{{partner.commissionPercentage}}` read the partner's default at render
 * time, so editing the partner silently rewrote every agreement not yet
 * signed. Now the agreement takes a snapshot when it is created:
 *
 * - an explicit agreement value always wins and is never overwritten;
 * - otherwise the partner's `defaultCommissionRate` is copied in, when it is
 *   configured. The column defaults to 0 and 0 means "not configured" — the
 *   reading agreements already gave it — so 0 is not snapshotted as "0%";
 * - the currency is the explicit one, else the partner's own, else the
 *   platform reporting currency.
 *
 * Every creation path — `POST /contracts`, the runtime create behind the
 * admin's "Create agreement" from a partner, create-from-source, copy, and
 * amend/renew — goes through `ContractsService.create`, which calls this.
 * Nothing re-reads the partner afterwards, so a later change to the partner's
 * default never reaches an existing agreement. Agreements created before the
 * snapshot existed have a null rate and keep the render-time fallback in
 * `partnerPlaceholderValues`; they are not backfilled, because writing a
 * commission term into an agreement nobody re-read is the silent change this
 * replaces.
 */
export function agreementCommercialDefaults(
  explicit: {
    commissionPercentage?: number | null;
    currencyCode?: string | null;
  },
  partner: {
    defaultCommissionRate?: { toString(): string } | number | null;
    currencyCode?: string | null;
  } | null,
  reportingCurrency: string,
): { commissionPercentage: number | undefined; currencyCode: string } {
  const partnerRate =
    partner?.defaultCommissionRate === undefined ||
    partner?.defaultCommissionRate === null
      ? undefined
      : Number(partner.defaultCommissionRate.toString());
  const commissionPercentage =
    explicit.commissionPercentage !== undefined &&
    explicit.commissionPercentage !== null
      ? explicit.commissionPercentage
      : partnerRate !== undefined &&
          Number.isFinite(partnerRate) &&
          partnerRate > 0
        ? partnerRate
        : undefined;
  const currencyCode = (
    explicit.currencyCode?.trim() ||
    partner?.currencyCode?.trim() ||
    reportingCurrency
  ).toUpperCase();
  return { commissionPercentage, currencyCode };
}
