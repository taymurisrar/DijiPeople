import { redirect } from "next/navigation";

type ViewDesignerRouteProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationViewDesignerRoute({
  params,
}: ViewDesignerRouteProps) {
  const { tableKey } = await params;
  redirect(`/settings/customization/tables/${tableKey}/views`);
}
