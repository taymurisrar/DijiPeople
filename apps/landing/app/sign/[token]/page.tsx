import { PageShell } from "../../_components/site-shell";
import { SigningExperience } from "./signing-experience";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <PageShell>
      <SigningExperience token={token} />
    </PageShell>
  );
}
