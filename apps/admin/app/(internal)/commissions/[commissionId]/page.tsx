import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

export default async function CommissionDetailPage({
  params,
}: {
  params: Promise<{ commissionId: string }>;
}) {
  const { commissionId } = await params;
  return <RuntimeRecordRoute moduleKey="commissions" recordId={commissionId} />;
}
