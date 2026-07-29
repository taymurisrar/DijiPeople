import { notFound } from "next/navigation";
import { getSettingsRuntimeItem } from "./settings-runtime";

export function approvalMatricesRuntimeItem() {
  const item = getSettingsRuntimeItem("approvals", "approval-matrices");
  if (!item) notFound();
  return { ...item, route: "/settings/approval-matrices" };
}
