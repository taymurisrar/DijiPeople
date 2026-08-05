import { PartnerLeadForm } from "../partner-lead-form";
export default async function PartnerLeadPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  return <PartnerLeadForm reviewId={reviewId} />;
}
