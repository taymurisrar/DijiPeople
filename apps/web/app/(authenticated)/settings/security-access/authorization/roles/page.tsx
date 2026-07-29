import { notFound } from "next/navigation";
import { SettingsRuntimeList } from "../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../_lib/settings-runtime";

export default function SecurityAccessRolesListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = getSettingsRuntimeItem("security-access", "roles");
  if (!item || item.group !== "authorization") notFound();

  return <SettingsRuntimeList item={item} searchParams={searchParams} />;
}
