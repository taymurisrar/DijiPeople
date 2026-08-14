import { RuntimeRecordRoute } from "@/app/_components/runtime/runtime-record-route";

/**
 * The tenant control plane.
 *
 * There used to be a second, parallel tenant screen behind `?workspace=operations`
 * with its own header, tabs and forms — including branding management and a
 * generic Integrations table. Both are gone: branding belongs to the tenant
 * application and its own authorized users, and integration configuration now
 * sits under the module it belongs to in Apps & Modules.
 *
 * What remains is one screen, rendered by the shared platform runtime record
 * page, with the tenant-specific panels mounted on their tabs. One tenant, one
 * route, one design system.
 */
export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  return <RuntimeRecordRoute moduleKey="tenants" recordId={tenantId} />;
}
