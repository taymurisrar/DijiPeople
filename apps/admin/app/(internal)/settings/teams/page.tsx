import type { Metadata } from "next";
import { PlatformTeamsManager } from "@/app/_components/settings/platform-teams-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Teams",
};

type Candidate = { id: string; fullName?: string; name?: string; email?: string };

export default async function TeamsPage() {
  await requireSystemAdminUser("/settings/teams");

  /*
   * The member picker's options are read here so it is usable the moment the
   * list loads. A failure leaves it empty rather than blocking the page: teams
   * can still be reviewed, renamed and archived.
   */
  const users = await apiRequestJson<Candidate[]>(
    "/platform-users/owner-candidates",
  ).catch(() => [] as Candidate[]);

  return (
    <SettingsShell
      description="The groups support cases and assignment rules route work to."
      title="Teams"
    >
      <PlatformTeamsManager
        users={(Array.isArray(users) ? users : []).map((user) => ({
          id: user.id,
          name: user.fullName ?? user.name ?? user.email ?? user.id,
        }))}
      />
    </SettingsShell>
  );
}
