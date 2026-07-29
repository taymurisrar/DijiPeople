import { notFound } from "next/navigation";
import { SettingsRuntimeList } from "../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../_lib/settings-runtime";

export default function PayComponentsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const item = getSettingsRuntimeItem("payroll", "pay-components");
  if (!item) notFound();
  return <SettingsRuntimeList item={item} searchParams={searchParams} />;
}
