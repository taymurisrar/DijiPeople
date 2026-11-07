import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { EmployeeListItem } from "../employees/types";

export type CurrentEmployeeContext = {
  employee: EmployeeListItem | null;
  isReportingManager: boolean;
  /**
   * True when the API refused the lookup (403). That is a permission problem,
   * not an unlinked account, and callers must not present it as one
   * (DP-QA-002: "Employee profile not linked" told users to see an admin who
   * could not fix it).
   */
  accessDenied?: boolean;
};

export async function getCurrentEmployee(): Promise<CurrentEmployeeContext> {
  try {
    return await apiRequestJson<CurrentEmployeeContext>("/employees/me/context");
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return {
        employee: null,
        isReportingManager: false,
        accessDenied: true,
      };
    }

    throw error;
  }
}
