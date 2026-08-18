import type { Metadata } from "next";
import { PageShell } from "../../_components/site-shell";
import { SigningExperience } from "./signing-experience";

export const metadata: Metadata = {
  title: "Sign document",
  description:
    "Review and sign your DijiPeople agreement securely.",
};
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
