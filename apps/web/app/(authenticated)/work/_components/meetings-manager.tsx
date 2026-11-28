"use client";

import { useCallback, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { SelectField } from "@/app/components/ui/form-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  MEETING_PAGE_SIZE,
  MEETING_STATUSES,
  MEETING_STATUS_LABELS,
  attendeeSummary,
  buildMeetingsQuery,
  meetingTone,
  type Meeting,
  type MeetingStatus,
  type Page,
} from "../_lib/decisions";
import { personLabel, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import { DecisionFormDialog } from "./decision-form-dialog";
import { MeetingActionDialog } from "./meeting-action-dialog";
import { MeetingDetailDialog } from "./meeting-detail-dialog";
import { MeetingFormDialog, type ProjectOption } from "./meeting-form-dialog";
import { RecordPager } from "./record-pager";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...MEETING_STATUSES.map((value) => ({
    value,
    label: MEETING_STATUS_LABELS[value],
  })),
];

type Overlay =
  | { kind: "detail"; id: string }
  | { kind: "form"; meeting: Meeting | null; returnTo: string | null }
  | { kind: "action"; action: "hold" | "cancel"; meeting: Meeting }
  | { kind: "decision"; meeting: Meeting };

/**
 * Meetings the viewer can see. The API decides which are in reach and whether each
 * action is allowed; its message is shown as it arrives.
 */
export function MeetingsManager({
  canWrite,
  initialPage,
  link,
  people,
  projects,
}: {
  canWrite: boolean;
  initialPage: Page<Meeting>;
  /** Work item, blocker or project the list is narrowed to, from the URL. */
  link: { workItemId?: string; blockerId?: string; projectId?: string };
  people: PersonOption[];
  projects: ProjectOption[];
}) {
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<Meeting[]>(initialPage.items ?? []);
  const [total, setTotal] = useState(initialPage.total ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchPage = useCallback(
    async (nextStatus: MeetingStatus | "", nextSkip: number) => {
      setLoading(true);
      setError(null);
      try {
        const page = await workRequest<Page<Meeting>>(
          "work-meetings",
          `?${buildMeetingsQuery({ status: nextStatus, skip: nextSkip, ...link })}`,
        );
        setRows(page.items);
        setTotal(page.total);
        setSkip(nextSkip);
      } catch (e) {
        setError(e instanceof Error ? e.message : "The request failed.");
      } finally {
        setLoading(false);
      }
    },
    [link],
  );

  const changed = () => {
    setReloadKey((k) => k + 1);
    void fetchPage(status, skip);
  };

  const columns: DataTableColumn<Meeting>[] = [
    {
      key: "title",
      header: "Meeting",
      sortable: true,
      sortAccessor: (row) => row.title,
      searchAccessor: (row) => row.title,
      render: (row) => (
        <button
          className="text-left font-medium text-accent underline"
          onClick={() => setOverlay({ kind: "detail", id: row.id })}
          type="button"
        >
          {row.title}
        </button>
      ),
    },
    {
      key: "scheduled",
      header: "Scheduled",
      sortable: true,
      sortAccessor: (row) => row.scheduledAt,
      render: (row) => formatDateTime(row.scheduledAt),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusPill tone={meetingTone(row.status)}>
          {MEETING_STATUS_LABELS[row.status]}
        </StatusPill>
      ),
    },
    {
      key: "facilitator",
      header: "Facilitator",
      searchAccessor: (row) => personLabel(people, row.facilitatorEmployeeId),
      render: (row) =>
        row.facilitatorEmployeeId ? (
          personLabel(people, row.facilitatorEmployeeId)
        ) : (
          <span className="text-muted">None</span>
        ),
    },
    {
      key: "attendees",
      header: "Attendees",
      render: (row) => attendeeSummary(row),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <Button
          onClick={() => setOverlay({ kind: "detail", id: row.id })}
          size="xs"
          variant="outline"
        >
          Open
        </Button>
      ),
    },
  ];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label="Status"
          onChange={(value) => {
            const next = value as MeetingStatus | "";
            setStatus(next);
            void fetchPage(next, 0);
          }}
          options={STATUS_OPTIONS}
          value={status}
        />
        {canWrite ? (
          <Button
            onClick={() =>
              setOverlay({ kind: "form", meeting: null, returnTo: null })
            }
          >
            New meeting
          </Button>
        ) : null}
        {link.workItemId || link.blockerId || link.projectId ? (
          <Button href="/work/meetings" size="xs" variant="outline">
            Show all meetings
          </Button>
        ) : null}
      </div>

      {error ? (
        <div className="grid gap-3" role="alert">
          <p className="text-sm text-danger">{error}</p>
          <div>
            <Button onClick={() => void fetchPage(status, skip)} variant="secondary">
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      <div aria-busy={loading}>
        <DataTable
          columns={columns}
          emptyState={
            <EmptyState
              description="Meetings you organise, facilitate or attend appear here."
              title="No meetings to show"
            />
          }
          entityLogicalName="work-meetings"
          getRowKey={(row) => row.id}
          pagination={{ page: 1, pageSize: MEETING_PAGE_SIZE, total: rows.length }}
          rows={rows}
          searchPlaceholder="Search meetings"
        />
      </div>

      <RecordPager
        disabled={loading}
        label="Meetings"
        onSkip={(next) => void fetchPage(status, next)}
        pageSize={MEETING_PAGE_SIZE}
        shown={rows.length}
        skip={skip}
        total={total}
      />

      {overlay?.kind === "detail" ? (
        <MeetingDetailDialog
          canWrite={canWrite}
          meetingId={overlay.id}
          onClose={() => setOverlay(null)}
          onEdit={(meeting) =>
            setOverlay({ kind: "form", meeting, returnTo: overlay.id })
          }
          onHoldOrCancel={(action, meeting) =>
            setOverlay({ kind: "action", action, meeting })
          }
          onRecordDecision={(meeting) => setOverlay({ kind: "decision", meeting })}
          people={people}
          reloadKey={reloadKey}
        />
      ) : null}
      {overlay?.kind === "form" ? (
        <MeetingFormDialog
          link={link}
          meeting={overlay.meeting}
          onClose={() =>
            setOverlay(
              overlay.returnTo ? { kind: "detail", id: overlay.returnTo } : null,
            )
          }
          onSaved={(saved) => {
            changed();
            setOverlay({ kind: "detail", id: saved.id });
          }}
          people={people}
          projects={projects}
        />
      ) : null}
      {overlay?.kind === "action" ? (
        <MeetingActionDialog
          kind={overlay.action}
          meeting={overlay.meeting}
          onClose={() => setOverlay({ kind: "detail", id: overlay.meeting.id })}
          onDone={(next) => {
            changed();
            setOverlay({ kind: "detail", id: next.id });
          }}
        />
      ) : null}
      {overlay?.kind === "decision" ? (
        <DecisionFormDialog
          meeting={{ id: overlay.meeting.id, title: overlay.meeting.title }}
          onClose={() => setOverlay({ kind: "detail", id: overlay.meeting.id })}
          onSaved={() => {
            changed();
            setOverlay({ kind: "detail", id: overlay.meeting.id });
          }}
          people={people}
          projects={projects}
        />
      ) : null}
    </div>
  );
}
