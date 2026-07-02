import { notFound } from "next/navigation";
import { SettingsRuntimeRecord } from "../../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../../_lib/settings-runtime";

export default async function SettingsItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{
    category: string;
    settingGroup: string;
    item: string;
    id: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category, settingGroup, item: itemKey, id } = await params;
  const item = getSettingsRuntimeItem(category, itemKey);
  if (!item || item.group !== settingGroup) notFound();
  return (
    <SettingsRuntimeRecord
      item={item}
      mode="read"
      recordId={id}
      searchParams={searchParams}
    />
  );
}
