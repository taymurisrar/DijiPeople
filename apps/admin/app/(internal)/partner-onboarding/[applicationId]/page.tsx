import type { Metadata } from "next";
import { PartnerOnboardingReview } from "@/app/_components/partners/partner-onboarding-review";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Partner Onboarding",
};


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
