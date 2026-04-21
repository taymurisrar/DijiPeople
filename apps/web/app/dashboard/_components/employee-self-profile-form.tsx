"use client";

import { EmployeePersonalInfoForm } from "../employees/_components/employee-personal-info-form";
import { EmployeeProfile } from "../employees/types";

export function EmployeeSelfProfileForm({
  employee,
}: {
  employee: EmployeeProfile;
}) {
  return <EmployeePersonalInfoForm employee={employee} mode="self-service" />;
}
