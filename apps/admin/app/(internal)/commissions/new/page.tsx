import type { Metadata } from "next";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";
import { apiRequestJson } from "@/lib/server-api";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "New commission",
};

/*
 * ADR-0026 D3. A commission is an operator-recorded ledger entry. Opened with
 * `?partnerId=`, the form starts on that partner with its currency and its
 * configured default commission; the API applies the same defaults when they
 * are left empty, computes the amount, and refuses a linked lead, customer or
 * invoice the partner did not refer.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  const { partnerId } = await searchParams;
  const partner = partnerId
    ? await apiRequestJson<{
        currencyCode?: string | null;
        defaultCommissionRate?: number | null;
      }>(`/partners/${encodeURIComponent(partnerId)}`).catch(() => null)
    : null;
  return (
    <RuntimeRecordRoute
      moduleKey="commissions"
      initialValues={{
        partnerId: partner ? partnerId : "",
        ...(partner?.currencyCode ? { currencyCode: partner.currencyCode } : {}),
        ...(typeof partner?.defaultCommissionRate === "number" &&
        partner.defaultCommissionRate > 0
          ? { commissionRate: partner.defaultCommissionRate }
          : {}),
      }}
    />
  );
}
