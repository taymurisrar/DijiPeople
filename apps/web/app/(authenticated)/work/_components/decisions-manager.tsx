"use client";

import { useCallback, useState } from "react";
import { DataTable } from "@/app/components/data-table/data-table";
import type { DataTableColumn } from "@/app/components/data-table/types";
import { Button } from "@/app/components/ui/button";
import { EmptyState } from "@/app/components/ui/empty-state";
import { CheckboxField, SelectField } from "@/app/components/ui/form-control";
import { SegmentedControl } from "@/app/components/ui/segmented-control";
import { StatusPill } from "@/app/components/ui/status-pill";
import { formatDateTime } from "@/lib/formatting-context";
import {
  DECISION_PAGE_SIZE,
  DECISION_STATUSES,
  DECISION_STATUS_LABELS,
  buildDecisionsQuery,
  buildReversePayload,
  decisionTone,
  validateReason,
  type Decision,
  type DecisionDetail,
  type DecisionStatus,
  type Page,
} from "../_lib/decisions";
import { personLabel, type PersonOption } from "../_lib/people";
import { workRequest } from "../_lib/work-client";
import {
  AddActionDialog,
  SupersedeDialog,
} from "./decision-action-dialogs";
import {
  DecisionDetailDialog,
  type DecisionActKind,
} from "./decision-detail-dialog";
import { DecisionFormDialog } from "./decision-form-dialog";
import type { ProjectOption } from "./meeting-form-dialog";
import { NoteDialog } from "./note-dialog";
import { OpenActionsPanel } from "./open-actions-panel";
import { RecordPager } from "./record-pager";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...DECISION_STATUSES.map((value) => ({
    value,
    label: DECISION_STATUS_LABELS[value],
  })),
];

type View = "register" | "open-actions";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "register", label: "Register" },
  { value: "open-actions", label: "Open actions" },
];

type Filters = { status: DecisionStatus | ""; mine: boolean };

type Overlay =
  | { kind: "detail"; id: string }
  | { kind: "create" }
  | { kind: "act"; act: DecisionActKind; detail: DecisionDetail };

/**
 * The decision register. Decisions are never edited or deleted: they are confirmed,
 * superseded by a new one, or reversed with a reason, and the register keeps all of
 * it. The API decides what is in reach and whether each action is allowed.
 */
export function DecisionsManager({
  canWrite,
  initialPage,
  link,
  openId,
  people,
  projects,
}: {
  canWrite: boolean;
  initialPage: Page<Decision>;
  /** Work item, blocker or project the register is narrowed to, from the URL. */
  link: { workItemId?: string; blockerId?: string; projectId?: string };
  /** A decision to open on arrival, from a link. */
  openId?: string;
  people: PersonOption[];
  projects: ProjectOption[];
}) {
  const [view, setView] = useState<View>("register");
  const [filters, setFilters] = useState<Filters>({ status: "", mine: false });
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<Decision[]>(initialPage.items ?? []);
  const [total, setTotal] = useState(initialPage.total ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(
    openId ? { kind: "detail", id: openId } : null,
  );
  const [reloadKey, setReloadKey] = useState(0);

  const fetchPage = useCallback(
    async (next: Filters, nextSkip: number) => {
      setLoading(true);
      setError(null);
      try {
        const page = await workRequest<Page<Decision>>(
          "work-decisions",
          `?${buildDecisionsQuery({ ...next, skip: nextSkip, ...link })}`,
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
    void fetchPage(filters, skip);
  };

  const change = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    void fetchPage(next, 0);
  };

  const columns: DataTableColumn<Decision>[] = [
    {
      key: "title",
      header: "Decision",
      sortable: true,
      sortAccessor: (row) => row.title,
      searchAccessor: (row) => `${row.title} ${row.decision}`,
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
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusPill tone={decisionTone(row.status)}>
          {DECISION_STATUS_LABELS[row.status]}
        </StatusPill>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      searchAccessor: (row) => personLabel(people, row.ownerEmployeeId),
      render: (row) =>
        row.ownerEmployeeId ? (
          personLabel(people, row.ownerEmployeeId)
        ) : (
          <span className="text-muted">No owner</span>
        ),
    },
    {
      key: "decided",
      header: "Decided",
      sortable: true,
      sortAccessor: (row) => row.decidedAt ?? "",
      render: (row) =>
        row.decidedAt ? (
          formatDateTime(row.decidedAt)
        ) : (
          <span className="text-muted">Not yet</span>
        ),
    },
    {
      key: "actions-count",
      header: "Open actions",
      render: (row) =>
        `${row.openActionCount ?? 0} of ${row.actionCount ?? 0}`,
    },
    {
      key: "open",
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

  const backToDetail = (id: string) => setOverlay({ kind: "detail", id });

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <SegmentedControl
          label="View"
          onChange={setView}
          options={VIEW_OPTIONS}
          value={view}
        />
        {canWrite ? (
          <Button onClick={() => setOverlay({ kind: "create" })}>New decision</Button>
        ) : null}
        {link.workItemId || link.blockerId || link.projectId ? (
          <Button href="/work/decisions" size="xs" variant="outline">
            Show all decisions
          </Button>
        ) : null}
      </div>

      {view === "register" ? (
        <section
          aria-label="Decision register"
          className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
        >
          <div className="flex flex-wrap items-end gap-4">
            <SelectField
              label="Status"
              onChange={(value) => change({ status: value as DecisionStatus | "" })}
              options={STATUS_OPTIONS}
              value={filters.status}
            />
            <CheckboxField
              checked={filters.mine}
              label="Owned by me"
              onChange={(mine) => change({ mine })}
            />
          </div>

          {error ? (
            <div className="grid gap-3" role="alert">
              <p className="text-sm text-danger">{error}</p>
              <div>
                <Button onClick={() => void fetchPage(filters, skip)} variant="secondary">
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
                  description="Decisions you own, took part in or were given work from appear here."
                  title="No decisions to show"
                />
              }
              entityLogicalName="work-decisions"
              getRowKey={(row) => row.id}
              pagination={{ page: 1, pageSize: DECISION_PAGE_SIZE, total: rows.length }}
              rows={rows}
              searchPlaceholder="Search decisions"
            />
          </div>

          <RecordPager
            disabled={loading}
            label="Decisions"
            onSkip={(next) => void fetchPage(filters, next)}
            pageSize={DECISION_PAGE_SIZE}
            shown={rows.length}
            skip={skip}
            total={total}
          />
        </section>
      ) : (
        <OpenActionsPanel
          onOpen={(id) => setOverlay({ kind: "detail", id })}
          people={people}
          reloadKey={reloadKey}
        />
      )}

      {overlay?.kind === "detail" ? (
        <DecisionDetailDialog
          canWrite={canWrite}
          decisionId={overlay.id}
          onAct={(act, detail) => setOverlay({ kind: "act", act, detail })}
          onChanged={changed}
          onClose={() => setOverlay(null)}
          onNavigate={(id) => setOverlay({ kind: "detail", id })}
          people={people}
          reloadKey={reloadKey}
        />
      ) : null}
      {overlay?.kind === "create" ? (
        <DecisionFormDialog
          link={link}
          onClose={() => setOverlay(null)}
          onSaved={(saved) => {
            changed();
            setOverlay({ kind: "detail", id: saved.id });
          }}
          people={people}
          projects={projects}
        />
      ) : null}
      {overlay?.kind === "act" && overlay.act === "supersede" ? (
        <SupersedeDialog
          decision={overlay.detail}
          onClose={() => backToDetail(overlay.detail.id)}
          onDone={(successor) => {
            changed();
            backToDetail(successor.id);
          }}
        />
      ) : null}
      {overlay?.kind === "act" && overlay.act === "action" ? (
        <AddActionDialog
          decision={overlay.detail}
          onClose={() => backToDetail(overlay.detail.id)}
          onDone={() => {
            changed();
            backToDetail(overlay.detail.id);
          }}
          people={people}
        />
      ) : null}
      {overlay?.kind === "act" && overlay.act === "reverse" ? (
        <NoteDialog
          confirmLabel="Reverse decision"
          fieldLabel="Reason"
          onClose={() => backToDetail(overlay.detail.id)}
          onConfirm={async (reason) => {
            await workRequest("work-decisions", `/${overlay.detail.id}/reverse`, {
              method: "POST",
              body: buildReversePayload(reason),
            });
            changed();
            backToDetail(overlay.detail.id);
          }}
          title={`Reverse ${overlay.detail.title}`}
          validate={validateReason}
        />
      ) : null}
    </div>
  );
}
