"use client";

import { useState } from "react";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import {
  type DutyHandover,
  type DutyOccurrence,
  type DutyTemplate,
  type Page,
  type TeamOption,
} from "../_lib/duties";
import type { PersonOption } from "../_lib/people";
import { DutyHandoverDialog } from "./duty-handover-dialog";
import { DutyHandoversPanel } from "./duty-handovers-panel";
import { DutyOccurrenceDialog } from "./duty-occurrence-dialog";
import { DutyOccurrencesPanel } from "./duty-occurrences-panel";
import { DutyTemplateDialog } from "./duty-template-dialog";
import { DutyTemplatesPanel } from "./duty-templates-panel";

type View = "duties" | "templates" | "handovers";

type HandoverTarget = { occurrenceId?: string; title?: string };

/** A new template starts in the viewer's own zone; it is only read when the dialog opens. */
function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * The Duties screen: the viewer's duties with their checklists, handovers, and,
 * for someone who manages work, the templates duties are generated from. What
 * the viewer may see or change is the API's decision on every call.
 */
export function DutiesManager({
  canManage,
  canWrite,
  initialHandovers,
  initialOccurrences,
  people,
  teams,
}: {
  canManage: boolean;
  canWrite: boolean;
  initialHandovers: Page<DutyHandover>;
  initialOccurrences: Page<DutyOccurrence>;
  people: PersonOption[];
  teams: TeamOption[];
}) {
  const [view, setView] = useState<View>("duties");
  const [refreshKey, setRefreshKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [handover, setHandover] = useState<HandoverTarget | null>(null);
  const [editing, setEditing] = useState<DutyTemplate | "new" | null>(null);

  const refresh = () => setRefreshKey((value) => value + 1);

  const options = [
    { label: "My duties", value: "duties" as const },
    ...(canManage ? [{ label: "Templates", value: "templates" as const }] : []),
    { label: "Handovers", value: "handovers" as const },
  ];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
      <div className="max-w-full overflow-x-auto">
        <SegmentedControl
          label="View"
          onChange={setView}
          options={options}
          value={view}
        />
      </div>

      {/* Every view stays mounted and is only hidden, so a view keeps its page,
          its filters and the changes it made while another is in front. */}
      <div hidden={view !== "duties"}>
        <DutyOccurrencesPanel
          canFilterTemplates={canManage}
          initialPage={initialOccurrences}
          onOpen={(occurrence) => setOpenId(occurrence.id)}
          people={people}
          refreshKey={refreshKey}
        />
      </div>
      {canManage ? (
        <div hidden={view !== "templates"}>
          <DutyTemplatesPanel
            onEdit={setEditing}
            onGenerated={refresh}
            onNew={() => setEditing("new")}
            people={people}
            refreshKey={refreshKey}
            teams={teams}
          />
        </div>
      ) : null}
      <div hidden={view !== "handovers"}>
        <DutyHandoversPanel
          canWrite={canWrite}
          initialPage={initialHandovers}
          onNew={() => setHandover({})}
          refreshKey={refreshKey}
          teams={teams}
        />
      </div>

      {openId ? (
        <DutyOccurrenceDialog
          canWrite={canWrite}
          occurrenceId={openId}
          onChanged={refresh}
          onClose={() => setOpenId(null)}
          onHandover={(occurrence) => {
            setOpenId(null);
            setHandover({
              occurrenceId: occurrence.id,
              title: occurrence.templateName,
            });
          }}
        />
      ) : null}
      {handover ? (
        <DutyHandoverDialog
          occurrenceId={handover.occurrenceId}
          occurrenceTitle={handover.title}
          onClose={() => setHandover(null)}
          onDone={() => {
            setHandover(null);
            setView("handovers");
            refresh();
          }}
          teams={teams}
        />
      ) : null}
      {editing ? (
        <DutyTemplateDialog
          defaultTimezone={browserTimezone()}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            refresh();
          }}
          people={people}
          teams={teams}
          template={editing === "new" ? null : editing}
        />
      ) : null}
    </div>
  );
}
