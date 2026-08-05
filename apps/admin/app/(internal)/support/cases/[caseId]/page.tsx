import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";
export default async function Page({ params }: { params: Promise<{ caseId: string }> }) { const { caseId } = await params; return <RuntimeRecordRoute moduleKey="support-cases" recordId={caseId} />; }

