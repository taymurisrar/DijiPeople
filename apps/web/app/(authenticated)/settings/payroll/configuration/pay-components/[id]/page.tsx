import { notFound } from "next/navigation";
import { SettingsRuntimeRecord } from "../../../../_components/settings-runtime-pages";
import { getSettingsRuntimeItem } from "../../../../_lib/settings-runtime";

export default async function PayComponentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, item] = await Promise.all([
    params,
    Promise.resolve(getSettingsRuntimeItem("payroll", "pay-components")),
  ]);
  if (!item) notFound();
  return (
    <SettingsRuntimeRecord
      item={item}
      mode="read"
      recordId={id}
      searchParams={searchParams}
    />
  );
}
