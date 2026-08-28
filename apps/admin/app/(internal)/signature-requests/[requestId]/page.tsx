import type { Metadata } from "next";
import { SignatureRequestDetail } from "@/app/_components/documents/signature-request-detail";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "Signature Requests",
};


export default async function Page({ params }: { params: Promise<{ requestId: string }> }) {
  const [{ requestId }, user] = await Promise.all([params, requireSystemAdminUser("/signature-requests")]);
  return (
    <SignatureRequestDetail
      requestId={requestId}
      roleKeys={[user.role, ...(user.roleKeys ?? [])]}
      permissionKeys={user.permissionKeys}
    />
  );
}
