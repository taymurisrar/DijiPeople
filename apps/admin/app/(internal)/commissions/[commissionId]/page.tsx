import type { Metadata } from "next";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Commissions",
};


export default async function CommissionDetailPage({
  params,
}: {
  params: Promise<{ commissionId: string }>;
}) {
  const { commissionId } = await params;
  return <RuntimeRecordRoute moduleKey="commissions" recordId={commissionId} />;
}
