import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  const { subscriptionId } = await params;
  return (
    <RuntimeRecordRoute moduleKey="subscriptions" recordId={subscriptionId} />
  );
}
