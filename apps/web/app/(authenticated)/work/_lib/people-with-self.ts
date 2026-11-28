import { apiRequestJson } from "@/lib/server-api";
import { loadEmployeeOptions } from "./employee-options";
import type { PersonOption } from "./people";

type Me = {
  user?: {
    employeeId?: string | null;
    firstName?: string;
    lastName?: string;
  };
};

/**
 * The employees the caller can read, plus the caller's own record. A person whose
 * access reaches nobody but others (or only part of the company) still owns and
 * organises things, and a name that reads "Employee 1a2b3c4d" for oneself is a
 * defect. A nicety: a failure leaves the list as it was.
 */
export async function loadPeopleWithSelf(): Promise<PersonOption[]> {
  const [people, me] = await Promise.all([
    loadEmployeeOptions(),
    apiRequestJson<Me>("/auth/me").catch((): Me => ({})),
  ]);
  const own = me.user?.employeeId;
  if (!own || people.some((p) => p.id === own)) return people;
  const name = `${me.user?.firstName ?? ""} ${me.user?.lastName ?? ""}`.trim();
  return name ? [{ id: own, name }, ...people] : people;
}
