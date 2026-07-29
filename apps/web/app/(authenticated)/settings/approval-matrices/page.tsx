import { SettingsRuntimeList } from "../_components/settings-runtime-pages";
import { approvalMatricesRuntimeItem } from "../_lib/approval-matrices-runtime";

export default function ApprovalMatricesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = approvalMatricesRuntimeItem();
  return <SettingsRuntimeList item={item} searchParams={searchParams} />;
}
