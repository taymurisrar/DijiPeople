import type { Metadata } from "next";
import { AssignmentRulesManager } from "@/app/_components/settings/assignment-rules-manager";
import { SettingsShell } from "@/app/_components/settings/settings-shell";
import { requireSystemAdminUser } from "@/lib/auth";
import { apiRequestJson } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Assignment Rules",
};

type Candidate = { id: string; fullName?: string; name?: string; email?: string };
type TeamList = { items?: { id: string; name: string }[] };

export default async function AssignmentRulesPage() {
  await requireSystemAdminUser("/settings/assignment-rules");

  /*
   * The pickers' options are read here so the form is usable the moment the
   * rules load. A failure leaves the list empty rather than blocking the page:
   * existing rules can still be reviewed, enabled and disabled.
   */
  const [users, teams] = await Promise.all([
    apiRequestJson<Candidate[]>("/platform-users/owner-candidates").catch(
      () => [] as Candidate[],
    ),
    apiRequestJson<TeamList>("/platform-teams?active=true&pageSize=100").catch(
      () => ({ items: [] }) as TeamList,
    ),
  ]);

  return (
    <SettingsShell
      description="Choose who owns new leads, customers and support cases. Rules apply to records created after a rule is enabled, never to existing ones, and never replace an owner someone set on purpose."
      title="Assignment rules"
    >
      <AssignmentRulesManager
        teams={(teams.items ?? []).map((team) => ({
          id: team.id,
          name: team.name,
        }))}
        users={(Array.isArray(users) ? users : []).map((user) => ({
          id: user.id,
          name: user.fullName ?? user.name ?? user.email ?? user.id,
        }))}
      />
    </SettingsShell>
  );
}
