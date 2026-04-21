import { ApiRequestError, apiRequestJson } from "@/lib/server-api";
import { hasPermission } from "@/lib/permissions";
import { SessionUser } from "@/lib/auth";
import { EmployeeListItem, EmployeeListResponse } from "../employees/types";

export type CurrentEmployeeContext = {
  employee: EmployeeListItem | null;
  isReportingManager: boolean;
};

export async function getCurrentEmployee(
  user: SessionUser,
): Promise<CurrentEmployeeContext> {
  const canReadEmployees = hasPermission(user.permissionKeys, "employees.read");

  if (!canReadEmployees) {
    return {
      employee: null,
      isReportingManager: false,
    };
  }

  try {
    const employees = await apiRequestJson<EmployeeListResponse>(
      "/employees?pageSize=100",
    );

    const currentEmployee =
      employees.items.find((employee) => employee.user?.id === user.userId) ?? null;

    if (!currentEmployee) {
      return {
        employee: null,
        isReportingManager: false,
      };
    }

    const currentEmployeeId = currentEmployee.id;

    const isReportingManager = employees.items.some((employee) => {
      const managedByCurrentEmployee =
        employee.reportingManagerEmployeeId === currentEmployeeId ||
        employee.managerEmployeeId === currentEmployeeId ||
        employee.reportingManager?.id === currentEmployeeId ||
        employee.manager?.id === currentEmployeeId;

      return managedByCurrentEmployee;
    });

    return {
      employee: currentEmployee,
      isReportingManager,
    };
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
