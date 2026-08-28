import type { Metadata } from "next";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Partners",
};

import{PageHeader}from"@/app/_components/ui/page-header";import{OperationalSettingsForm}from"@/app/_components/settings/operational-settings-form";import{apiRequestJson}from"@/lib/server-api";export default async function Page(){const data=await apiRequestJson<{partnerSettings:Record<string,unknown>}>("/super-admin/platform-settings");return <main className="space-y-5"><PageHeader eyebrow="Settings / Partners" title="Partner policies" description="Configure onboarding, agreement, commission, and lead-submission controls."/><OperationalSettingsForm title="Partner lifecycle policy" description="Activation and submission rules are enforced by the partner services." settingKey="partnerSettings" initialValues={data.partnerSettings} fields={[{key:'requireSignedAgreementForActivation',label:'Require signed agreement',description:'Partners cannot activate until an agreement is fully signed.',type:'boolean'},{key:'onboardingLinkExpiryDays',label:'Onboarding link expiry',description:'Days before an invitation link expires.',type:'number',min:1,max:90},{key:'requireTaxInformation',label:'Require tax information',description:'Tax identity is required in onboarding.',type:'boolean'},{key:'requireBankInformation',label:'Require payout information',description:'Payout details are required in onboarding.',type:'boolean'},{key:'leadSubmissionRequiresApproval',label:'Review submitted leads',description:'Internal approval is required before normal lead processing.',type:'boolean'},{key:'defaultCommissionRate',label:'Default commission (%)',description:'Initial commission proposal for new partners.',type:'number',min:0,max:100}]}/></main>}
