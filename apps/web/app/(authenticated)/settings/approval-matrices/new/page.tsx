import { SettingsRuntimeRecord } from "../../_components/settings-runtime-pages";
import { approvalMatricesRuntimeItem } from "../../_lib/approval-matrices-runtime";

export default function NewApprovalMatrixPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <SettingsRuntimeRecord
      item={approvalMatricesRuntimeItem()}
      mode="create"
      searchParams={searchParams}
    />
  );
}
