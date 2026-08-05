import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerAccountId: string }> }) {
  const { customerAccountId } = await params;
  return <RuntimeRecordRoute moduleKey="customers" recordId={customerAccountId} />;
}
