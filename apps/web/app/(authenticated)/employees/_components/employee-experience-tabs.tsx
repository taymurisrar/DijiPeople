"use client";

import { useEffect, useState } from "react";
import type { EmployeeEducationRecord, EmployeePreviousEmploymentRecord } from "../types";
import { EmployeeEducationManager } from "./employee-education-manager";
import { EmployeePreviousEmploymentManager } from "./employee-previous-employment-manager";

export function EmployeeExperienceTabs({ employeeId, tab }: { employeeId: string; tab: "education" | "previous-employment" }) {
  const [records, setRecords] = useState<Array<EmployeeEducationRecord | EmployeePreviousEmploymentRecord>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const path = tab === "education" ? "education" : "previous-employments";
    fetch(`/api/employees/${employeeId}/${path}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message ?? "Unable to load employee records.");
        return Array.isArray(payload) ? payload : [];
      })
      .then((payload) => { if (active) { setRecords(payload); setError(null); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to load employee records."); });
    return () => { active = false; };
  }, [employeeId, tab]);
  if (error) return <p className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</p>;
  return tab === "education" ? (
    <EmployeeEducationManager employeeId={employeeId} educationRecords={records as EmployeeEducationRecord[]} />
  ) : (
    <EmployeePreviousEmploymentManager employeeId={employeeId} previousEmployments={records as EmployeePreviousEmploymentRecord[]} />
  );
}
