import { PartnerOnboardingReview } from "@/app/_components/partners/partner-onboarding-review";
import { requireSystemAdminUser } from "@/lib/auth";

export default async function PartnerOnboardingDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const [{ applicationId }, user] = await Promise.all([
    params,
    requireSystemAdminUser("/partner-onboarding"),
  ]);
  return (
    <PartnerOnboardingReview
      applicationId={applicationId}
      roleKeys={[user.role, ...(user.roleKeys ?? [])]}
      permissionKeys={user.permissionKeys}
    />
  );
}
