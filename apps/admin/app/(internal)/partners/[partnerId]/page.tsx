import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

export default async function Page({
  params,
}: {
  params: Promise<{ partnerId: string }>;
}) {
  const { partnerId } = await params;
  return <RuntimeRecordRoute moduleKey="partners" recordId={partnerId} />;
}
