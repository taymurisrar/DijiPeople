import { renderModuleTab } from "../../../_components/module-tab-page";

type TableFormsPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableFormsPage({
  params,
}: TableFormsPageProps) {
  const { tableKey } = await params;
  return renderModuleTab(tableKey, "forms");
}
