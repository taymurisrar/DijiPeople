import type { Metadata } from "next";
import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Payments",
};


export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return <RuntimeRecordRoute moduleKey="payments" recordId={paymentId} />;
}
