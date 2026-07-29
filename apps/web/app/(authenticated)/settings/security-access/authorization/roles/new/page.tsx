import { notFound } from "next/navigation";
import { SettingsRuntimeRecord } from "../../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../../_lib/settings-runtime";

export default function NewSecurityAccessRolePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = getSettingsRuntimeItem("security-access", "roles");
  if (!item || item.group !== "authorization") notFound();

  return (
    <SettingsRuntimeRecord
      item={item}
      mode="create"
      searchParams={searchParams}
    />
  );
}
