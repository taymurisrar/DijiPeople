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
  PackageEnvironmentVariable,
  PackageLifecycle,
  PackageReleaseReadiness,
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

  /*
   * TASK-0033 — lifecycle, release readiness and environment variables. Each
   * degrades to its own empty state rather than failing the whole page: the
   * package and its components are still worth showing without them.
   */
  const [lifecycle, readiness, environmentVariables] = await Promise.all([
    apiRequestJson<PackageLifecycle>(
      `/customization/packages/${packageId}/lifecycle`,
    ).catch(() => null),
    apiRequestJson<PackageReleaseReadiness>(
      `/customization/packages/${packageId}/release-readiness`,
    ).catch(() => null),
    apiRequestJson<PackageEnvironmentVariable[]>(
      "/customization/environment-variables",
    ).catch(() => [] as PackageEnvironmentVariable[]),
  ]);

  return (
    <SettingsShell
      description=""
      eyebrow="Package"
      title={packageDetail.displayName}
    >
      <PackageDetailShell
        environmentVariables={environmentVariables}
        lifecycle={lifecycle}
        modules={modules}
        packageDetail={packageDetail}
        readiness={readiness}
      />
    </SettingsShell>
  );
}
