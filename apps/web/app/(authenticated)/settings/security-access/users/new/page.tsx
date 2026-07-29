import { notFound } from "next/navigation";
import { SettingsRuntimeRecord } from "../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../_lib/settings-runtime";

export default async function NewSecurityAccessUserPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = getSettingsRuntimeItem("security-access", "users");
  if (!item) notFound();
  return (
    <SettingsRuntimeRecord
      item={item}
      mode="create"
      searchParams={searchParams}
    />
  );
}
