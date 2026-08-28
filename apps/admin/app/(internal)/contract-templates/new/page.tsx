import type { Metadata } from "next";
import { ContractTemplateEditor } from "@/app/_components/documents/contract-template-editor";
import { requireSystemAdminUser } from "@/lib/auth";

/* Each screen titles itself. 47 of 48 shared one title, so a tab, a
   bookmark and a screen reader's announcement said the same thing on
   every route (BUG-1421). */
export const metadata: Metadata = {
  title: "New contract templates",
};


export default async function Page() {
  const user = await requireSystemAdminUser("/contract-templates/new");
  return <ContractTemplateEditor roleKeys={[user.role, ...(user.roleKeys ?? [])]} permissionKeys={user.permissionKeys} />;
}
