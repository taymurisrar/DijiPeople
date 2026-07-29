import { redirect } from "next/navigation";

export default async function LegacyLeavePolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/settings/people/leave/leave-policies/${id}`);
}
