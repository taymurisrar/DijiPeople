import { redirect } from "next/navigation";

type FormDesignerRouteProps = {
  params: Promise<{ tableKey: string }>;
};

export default async function CustomizationFormDesignerRoute({
  params,
}: FormDesignerRouteProps) {
  const { tableKey } = await params;
  redirect(`/settings/customization/tables/${tableKey}/forms`);
}
