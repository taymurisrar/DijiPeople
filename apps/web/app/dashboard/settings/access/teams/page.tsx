import { apiRequestJson } from "@/lib/server-api";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { requireSettingsPermissions } from "../../_lib/require-settings-permission";
import { SettingsShell } from "../../_components/settings-shell";
import { TeamAccessManagement } from "../../_components/team-access-management";
import {
  AccessRoleRecord,
  AccessTeamRecord,
  AccessUserRecord,
  BusinessUnitRecord,
} from "../../types";

export default async function AccessTeamsPage() {
  await requireSettingsPermissions([PERMISSION_KEYS.TEAMS_READ]);

  const [teams, users, roles, businessUnits] = await Promise.all([
    apiRequestJson<AccessTeamRecord[]>("/teams"),
    apiRequestJson<AccessUserRecord[]>("/users"),
    apiRequestJson<AccessRoleRecord[]>("/roles"),
    apiRequestJson<BusinessUnitRecord[]>("/business-units"),
  ]);

  return (
    <SettingsShell
      description="Manage access teams, members, team roles, and business-unit placement. Team roles contribute to effective user access."
      eyebrow="Role & Access Management"
      title="Teams"
    >
      <TeamAccessManagement
        businessUnits={businessUnits}
        initialTeams={teams}
        roles={roles}
        users={users}
      />
    </SettingsShell>
  );
}
