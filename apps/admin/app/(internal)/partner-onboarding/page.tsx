import type { Metadata } from "next";
import { RuntimeModulePage } from "@/app/_components/runtime/runtime-module-page";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Partner Onboarding",
};


/**
 * BUG-0019. Same defect as the partner-inquiries list: this redirected to
 * `/partners?viewId=pending-onboarding`, a Partner list, while
 * `/partner-onboarding/[applicationId]` loads a PartnerOnboardingApplication.
 * The compliance review step had no reachable path through the product at all.
 */
export default function Page() {
  return <RuntimeModulePage moduleKey="partner-onboarding" />;
}
