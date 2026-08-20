import type { Metadata } from "next";
import { PageShell } from "../../../_components/site-shell";
import { ActivationForm } from "./activation-form";

export const metadata: Metadata = {
  title: "Activate partner account",
  description:
    "Set the password for your DijiPeople partner portal account.",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <PageShell>
      <div className="py-12">
        <ActivationForm token={token} />
      </div>
    </PageShell>
  );
}
