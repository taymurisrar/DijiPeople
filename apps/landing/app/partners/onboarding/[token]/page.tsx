import { PageShell } from "../../../_components/site-shell";
import { PartnerOnboardingForm } from "./partner-onboarding-form";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <PageShell>
      <div className="mx-auto max-w-4xl py-8">
        <PartnerOnboardingForm token={token} />
      </div>
    </PageShell>
  );
}
