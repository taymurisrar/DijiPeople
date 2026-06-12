import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../_lib/require-settings-permission";
import { PackageDetailShell } from "../../_components/package-detail-shell";
import type {
  CustomizationPackageDetail,
  CustomizationTable,
} from "../../types";

type PackageDetailPageProps = {
  params: Promise<{ packageId: string }>;
};

export default async function CustomizationPackageDetailPage({
  params,
}: PackageDetailPageProps) {
  const { packageId } = await params;
  await requireSettingsPermissions(["customization.read"]);
  const [packageDetail, modules] = await Promise.all([
    apiRequestJson<CustomizationPackageDetail>(
      `/customization/packages/${packageId}`,
    ),
    apiRequestJson<CustomizationTable[]>("/customization/tables"),
  ]);

  return (
    <SettingsShell
      description="Review Package metadata grouped by Module and component type."
      eyebrow="Package"
      title={packageDetail.displayName}
    >
      <PackageDetailShell packageDetail={packageDetail} modules={modules} />
    </SettingsShell>
  );
}
