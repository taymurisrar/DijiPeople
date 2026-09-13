import { renderModuleTab } from "../../../_components/module-tab-page";

type TableViewsPageProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationTableViewsPage({
  params,
}: TableViewsPageProps) {
  const { tableKey } = await params;
  return renderModuleTab(tableKey, "views");
}
