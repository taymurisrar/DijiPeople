import { PartnerContractDetail } from "../partner-contract-detail";
export default async function PartnerContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  return <PartnerContractDetail contractId={contractId} />;
}
