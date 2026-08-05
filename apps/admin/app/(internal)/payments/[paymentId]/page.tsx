import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return <RuntimeRecordRoute moduleKey="payments" recordId={paymentId} />;
}
