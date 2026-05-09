import { redirect } from "next/navigation";

type TenantLoginPageProps = {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TenantLoginPage({
  params,
  searchParams,
}: TenantLoginPageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const next = Array.isArray(resolvedSearchParams.next)
    ? resolvedSearchParams.next[0]
    : resolvedSearchParams.next;
  const query = new URLSearchParams({ tenant: tenantSlug });

  if (next) {
    query.set("next", next);
  }

  redirect(`/login?${query.toString()}`);
}
