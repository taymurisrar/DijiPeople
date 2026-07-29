import { notFound } from "next/navigation";
import { SettingsRuntimeRecord } from "../../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../../_lib/settings-runtime";

export default async function EditSecurityAccessUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = getSettingsRuntimeItem("security-access", "users");
  if (!item) notFound();
  const { userId } = await params;
  return (
    <SettingsRuntimeRecord
      item={item}
      mode="edit"
      recordId={userId}
      searchParams={searchParams}
    />
  );
}
