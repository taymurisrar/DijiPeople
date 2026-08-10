import { ContractTemplateEditor } from "@/app/_components/documents/contract-template-editor";
import { requireSystemAdminUser } from "@/lib/auth";
export default async function Page() { const user = await requireSystemAdminUser("/templates/new"); return <ContractTemplateEditor roleKeys={[user.role, ...(user.roleKeys ?? [])]} permissionKeys={user.permissionKeys} />; }
