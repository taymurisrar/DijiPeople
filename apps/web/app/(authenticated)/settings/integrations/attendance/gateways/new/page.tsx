import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { SettingsShell } from "../../../../_components/settings-shell";
import { requireSettingsPermissions } from "../../../../_lib/require-settings-permission";
import type { ApplicationRelease } from "../../_lib/types";
import { GatewaySetupWizard } from "./_components/gateway-setup-wizard";

export default async function NewGatewayPage() {
  await requireSettingsPermissions(
    [PERMISSION_KEYS.GATEWAYS_MANAGE],
    "/settings/integrations/attendance/gateways",
  );

  /*
   * A 404 here is the expected case today: no Integration Gateway release has
   * been published. The wizard says so plainly rather than offering a download
   * that does not exist.
   */
  const gatewayRelease = await apiRequestJson<ApplicationRelease>(
    "/app-releases/latest?appKey=INTEGRATION_GATEWAY&platform=WINDOWS",
  ).catch(() => null);

  return (
    <SettingsShell
      eyebrow="Integrations"
      title="Set up an integration gateway"
      description="Install a gateway on a machine inside your network so DijiPeople can reach your attendance devices."
    >
      <GatewaySetupWizard gatewayRelease={gatewayRelease} />
    </SettingsShell>
  );
}
