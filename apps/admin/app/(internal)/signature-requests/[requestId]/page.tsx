import { SignatureRequestDetail } from "@/app/_components/documents/signature-request-detail";
import { requireSystemAdminUser } from "@/lib/auth";

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
