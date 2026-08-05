import { ContractTemplateEditor } from "@/app/_components/documents/contract-template-editor";
import { requireSystemAdminUser } from "@/lib/auth";

export default async function Page({ params }: { params: Promise<{ templateId: string }> }) {
  const [{ templateId }, user] = await Promise.all([params, requireSystemAdminUser("/contract-templates")]);
  return <ContractTemplateEditor templateId={templateId} roleKeys={[user.role, ...(user.roleKeys ?? [])]} permissionKeys={user.permissionKeys} />;
}
