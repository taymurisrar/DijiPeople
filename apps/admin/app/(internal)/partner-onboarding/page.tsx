import { RuntimeModulePage } from "@/app/_components/runtime/runtime-module-page";

/**
 * BUG-0019. Same defect as the partner-inquiries list: this redirected to
 * `/partners?viewId=pending-onboarding`, a Partner list, while
 * `/partner-onboarding/[applicationId]` loads a PartnerOnboardingApplication.
 * The compliance review step had no reachable path through the product at all.
 */
export default function Page() {
  return <RuntimeModulePage moduleKey="partner-onboarding" />;
}
