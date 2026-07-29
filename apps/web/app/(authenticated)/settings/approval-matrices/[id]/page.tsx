import { SettingsRuntimeRecord } from "../../_components/settings-runtime-pages";
import { approvalMatricesRuntimeItem } from "../../_lib/approval-matrices-runtime";

export default async function ApprovalMatrixDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  return (
    <SettingsRuntimeRecord
      item={approvalMatricesRuntimeItem()}
      mode="read"
      recordId={id}
      searchParams={searchParams}
    />
  );
}
