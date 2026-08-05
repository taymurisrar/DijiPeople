import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

export default async function Page({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  return <RuntimeRecordRoute moduleKey="leads" recordId={leadId} />;
}
