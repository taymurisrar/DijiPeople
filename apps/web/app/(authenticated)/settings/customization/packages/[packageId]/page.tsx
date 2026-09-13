import { apiRequestJson } from "@/lib/server-api";
import { SettingsShell } from "../../../_components/settings-shell";
import {
  isAccessDeniedError,
  requireCustomizationPage,
} from "../../_lib/customization-access";
import { CustomizationAccessDenied } from "../../_components/customization-access-denied";
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
  const { allowed } = await requireCustomizationPage("packageDetail");
  if (!allowed) return <CustomizationAccessDenied />;

  let packageDetail: CustomizationPackageDetail;
  let modules: CustomizationTable[];
  try {
    [packageDetail, modules] = await Promise.all([
      apiRequestJson<CustomizationPackageDetail>(
        `/customization/packages/${packageId}`,
      ),
      apiRequestJson<CustomizationTable[]>("/customization/tables"),
    ]);
  } catch (error) {
    if (isAccessDeniedError(error)) return <CustomizationAccessDenied />;
    throw error;
  }

  return (
    <SettingsShell
      description=""
      eyebrow="Package"
      title={packageDetail.displayName}
    >
      <PackageDetailShell packageDetail={packageDetail} modules={modules} />
    </SettingsShell>
  );
}
