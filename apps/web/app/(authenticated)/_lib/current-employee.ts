import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { SessionUser } from "@/lib/auth";
import { EmployeeListItem } from "../employees/types";

export type CurrentEmployeeContext = {
  employee: EmployeeListItem | null;
  isReportingManager: boolean;
};

export async function getCurrentEmployee(
  _user: SessionUser,
): Promise<CurrentEmployeeContext> {
  try {
    return await apiRequestJson<CurrentEmployeeContext>("/employees/me/context");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return {
        employee: null,
        isReportingManager: false,
      };
    }

    throw error;
  }
}
