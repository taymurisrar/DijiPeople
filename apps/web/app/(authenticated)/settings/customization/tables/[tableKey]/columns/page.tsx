import { renderModuleTab } from "../../../_components/module-tab-page";

type TableColumnsPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableColumnsPage({
  params,
}: TableColumnsPageProps) {
  const { tableKey } = await params;
  return renderModuleTab(tableKey, "columns");
}
