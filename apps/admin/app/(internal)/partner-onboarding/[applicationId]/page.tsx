import { PartnerOnboardingReview } from "@/app/_components/partners/partner-onboarding-review";
export default async function PartnerOnboardingDetailPage({params}:{params:Promise<{applicationId:string}>}){const{applicationId}=await params;return <PartnerOnboardingReview applicationId={applicationId}/>}
