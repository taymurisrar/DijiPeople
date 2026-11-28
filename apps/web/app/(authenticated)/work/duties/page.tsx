import { requireSessionUser } from "@/lib/auth";
import { hasPermission, isSelfServiceUser } from "@/lib/permissions";
import { PERMISSION_KEYS } from "@/lib/security-keys";
import { apiRequestJson } from "@/lib/server-api";
import { AccessDeniedState } from "../../_components/access-denied-state";
import { DutiesManager } from "../_components/duties-manager";
import {
  buildHandoversQuery,
  buildOccurrencesQuery,
  type DutyHandover,
  type DutyOccurrence,
  type Page,
  type TeamOption,
} from "../_lib/duties";
import { loadEmployeeOptions } from "../_lib/employee-options";

type TeamRow = { id: string; name: string };

export default async function DutiesPage() {
  const user = await requireSessionUser("/work/duties");
  if (!hasPermission(user.permissionKeys, PERMISSION_KEYS.WORK_ITEMS_READ)) {
    return <AccessDeniedState />;
  }

  const canWrite = hasPermission(
    user.permissionKeys,
    PERMISSION_KEYS.WORK_ITEMS_WRITE,
  );
  // Templates are for someone who manages work; an employee's own duties and
  // handovers need no template access. The API still re-checks every template call.
  // The seeded Employee role holds "employees.update" for their own profile, which
  // is a management key only on paper (the navigation treats it the same way).
  const canManage =
    canWrite &&
    !isSelfServiceUser(
      user.permissionKeys.filter((key) => key !== "employees.update"),
    );

  const [occurrences, handovers, people, teams] = await Promise.all([
    apiRequestJson<Page<DutyOccurrence>>(
      `/work-duties/occurrences?${buildOccurrencesQuery({})}`,
    ),
    apiRequestJson<Page<DutyHandover>>(
      `/work-duties/handovers?${buildHandoversQuery({ status: "OPEN" })}`,
    ),
    loadEmployeeOptions(),
    // Team names are a nicety for pickers; an account without teams access gets none.
    apiRequestJson<TeamRow[] | { items?: TeamRow[] }>("/teams")
      .then((response) =>
        Array.isArray(response) ? response : (response.items ?? []),
      )
      .catch((): TeamRow[] => []),
  ]);

  const teamOptions: TeamOption[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
  }));

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Work
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Duties
        </h2>
      </section>
      <DutiesManager
        canManage={canManage}
        canWrite={canWrite}
        initialHandovers={handovers}
        initialOccurrences={occurrences}
        people={people}
        teams={teamOptions}
      />
    </div>
  );
}
