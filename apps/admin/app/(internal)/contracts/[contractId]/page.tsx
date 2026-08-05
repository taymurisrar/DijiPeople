import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";
export default async function Page({ params }: { params: Promise<{ contractId: string }> }) { const { contractId } = await params; return <RuntimeRecordRoute moduleKey="contracts" recordId={contractId} />; }

