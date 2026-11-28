"use client";

import { useCallback, useState } from "react";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import type { WorkUnit } from "../_lib/work-profile-form";
import {
  workProfilesRequest,
  type EmployeeOption,
  type WorkAssignment,
  type WorkProfileListItem,
} from "../_lib/work-profiles-client";
import { WorkAssignmentsPanel } from "./work-assignments-panel";
import { WorkProfilesPanel } from "./work-profiles-panel";
import { WorkUnitsPanel } from "./work-units-panel";

type Tab = "profiles" | "units" | "assignments";

/**
 * Work profiles settings: profiles with versioned definitions, the units they
 * are measured in, and who holds which profile. The server renders the first
 * data; every change re-reads from the API so the screen shows what is stored.
 * Assignments carry employee ids, so they are shown only to a user who can
 * manage work profiles (the API enforces the same).
 */
export function WorkProfilesManager({
  canManage,
  initialAssignments,
  initialProfiles,
  initialUnits,
  employees,
}: {
  canManage: boolean;
  employees: EmployeeOption[];
  initialAssignments: WorkAssignment[];
  initialProfiles: WorkProfileListItem[];
  initialUnits: WorkUnit[];
}) {
  const [tab, setTab] = useState<Tab>("profiles");
  const [units, setUnits] = useState(initialUnits);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [assignments, setAssignments] = useState(initialAssignments);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextUnits, nextProfiles, nextAssignments] = await Promise.all([
        workProfilesRequest<WorkUnit[]>("/units"),
        workProfilesRequest<WorkProfileListItem[]>(""),
        canManage
          ? workProfilesRequest<WorkAssignment[]>("/assignments")
          : Promise.resolve<WorkAssignment[]>([]),
      ]);
      setUnits(nextUnits);
      setProfiles(nextProfiles);
      setAssignments(nextAssignments);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not refresh work profiles.",
      );
    }
  }, [canManage]);

  const tabs: Array<{ label: string; value: Tab }> = [
    { label: "Profiles", value: "profiles" },
    { label: "Units", value: "units" },
    ...(canManage
      ? [{ label: "Assignments", value: "assignments" as const }]
      : []),
  ];

  return (
    <div className="grid gap-6">
      <SegmentedControl
        label="Work profiles sections"
        onChange={setTab}
        options={tabs}
        value={tab}
      />
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {tab === "profiles" ? (
        <WorkProfilesPanel
          canManage={canManage}
          onChanged={reload}
          profiles={profiles}
          units={units}
        />
      ) : null}
      {tab === "units" ? (
        <WorkUnitsPanel
          canManage={canManage}
          onChanged={reload}
          units={units}
        />
      ) : null}
      {tab === "assignments" && canManage ? (
        <WorkAssignmentsPanel
          assignments={assignments}
          employees={employees}
          onChanged={reload}
          profiles={profiles}
        />
      ) : null}
    </div>
  );
}
