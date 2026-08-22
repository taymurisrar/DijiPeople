"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import {
  closestCenter,
  DndContext,
  DraggableAttributes,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { JobOpeningStatusBadge } from "./job-opening-status-badge";
import { RecruitmentStageBadge } from "./recruitment-stage-badge";
import { useGovernedInput } from "@/app/components/feedback/use-governed-input";
import {
  hasMatchCriteriaConfigured,
  RecruitmentPipelineStageRecord,
  JobOpeningMatchCriteria,
  RecruitmentStage,
} from "../types";

const DEFAULT_STAGE_ORDER: RecruitmentStage[] = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "FINAL_REVIEW",
  "OFFER",
  "APPROVED",
  "HIRED",
  "ON_HOLD",
  "REJECTED",
  "WITHDRAWN",
];

type ApplicationItem = {
  id: string;
  stage: RecruitmentStage;
  appliedAt: string;
  matchScore?: number | null;
  candidate: {
    fullName: string;
    email: string;
  };
  jobOpening: {
    id: string;
    title: string;
    status: string;
    matchCriteria?: JobOpeningMatchCriteria | null;
  };
};

type SortableListeners = ReturnType<typeof useSortable>["listeners"];

type RecruitmentApplicationsBoardProps = {
  applications: ApplicationItem[];
  pipelineStages?: RecruitmentPipelineStageRecord[];
  requireRejectReason?: boolean;
};

type BoardState = Record<RecruitmentStage, ApplicationItem[]>;

function buildBoardState(
  applications: ApplicationItem[],
  stages: RecruitmentStage[],
): BoardState {
  return stages.reduce((accumulator, stage) => {
    accumulator[stage] = applications.filter(
      (application) => application.stage === stage,
    );
    return accumulator;
  }, {} as BoardState);
}

function findApplicationStage(
  board: BoardState,
  stages: RecruitmentStage[],
  applicationId: string,
): RecruitmentStage | null {
  for (const stage of stages) {
    if (board[stage].some((application) => application.id === applicationId)) {
      return stage;
    }
  }

  return null;
}

function normalizePipelineStages(
  pipelineStages: RecruitmentPipelineStageRecord[] | undefined,
  applications: ApplicationItem[],
) {
  const configuredStages = (pipelineStages ?? [])
    .filter((stage) => stage.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((stage) => stage.stageKey);
  const baseStages = configuredStages.length
    ? configuredStages
    : DEFAULT_STAGE_ORDER;
  return Array.from(
    new Set([
      ...baseStages,
      ...applications.map((application) => application.stage),
    ]),
  );
}

export function RecruitmentApplicationsBoard({
  applications,
  pipelineStages,
  requireRejectReason = false,
}: RecruitmentApplicationsBoardProps) {
  const { requestValue, governedInputDialog } = useGovernedInput();
  const router = useRouter();
  const stages = useMemo(
    () => normalizePipelineStages(pipelineStages, applications),
    [applications, pipelineStages],
  );
  const [board, setBoard] = useState<BoardState>(() =>
    buildBoardState(applications, stages),
  );
  const [activeApplicationId, setActiveApplicationId] = useState<string | null>(
    null,
  );
  const [savingApplicationId, setSavingApplicationId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 6,
      },
    }),
  );

  const activeApplication = useMemo(() => {
    if (!activeApplicationId) {
      return null;
    }

    for (const stage of stages) {
      const application = board[stage].find(
        (item) => item.id === activeApplicationId,
      );

      if (application) {
        return application;
      }
    }

    return null;
  }, [activeApplicationId, board, stages]);

  function moveApplicationInBoard(
    currentBoard: BoardState,
    applicationId: string,
    targetStage: RecruitmentStage,
  ): BoardState {
    const sourceStage = findApplicationStage(
      currentBoard,
      stages,
      applicationId,
    );

    if (!sourceStage || sourceStage === targetStage) {
      return currentBoard;
    }

    const application = currentBoard[sourceStage].find(
      (item) => item.id === applicationId,
    );

    if (!application) {
      return currentBoard;
    }

    return {
      ...currentBoard,
      [sourceStage]: currentBoard[sourceStage].filter(
        (item) => item.id !== applicationId,
      ),
      [targetStage]: [
        { ...application, stage: targetStage },
        ...currentBoard[targetStage],
      ],
    };
  }

  async function persistStageChange(
    applicationId: string,
    stage: RecruitmentStage,
    previousBoard: BoardState,
    rejectionReason?: string,
  ) {
    try {
      setSavingApplicationId(applicationId);
      setError(null);

      const response = await fetch(`/api/applications/${applicationId}/stage`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stage,
          rejectionReason,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        setBoard(previousBoard);
        setError(data?.message ?? "Unable to move application stage.");
        return;
      }

      router.refresh();
    } catch {
      setBoard(previousBoard);
      setError("Unable to move application stage.");
    } finally {
      setSavingApplicationId(null);
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveApplicationId(String(event.active.id));
    setError(null);
  }

  function handleDragCancel() {
    setActiveApplicationId(null);
  }

  // `async` because the rejection reason is now collected through a dialog
  // rather than `window.prompt`, which blocked the thread. dnd-kit does not
  // await its handler, and does not need to: nothing after this depends on the
  // drag gesture. ITEM-0031.
  async function handleDragEnd(event: DragEndEvent) {
    const applicationId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;

    setActiveApplicationId(null);

    if (!overId) {
      return;
    }

    const previousBoard = board;
    const sourceStage = findApplicationStage(
      previousBoard,
      stages,
      applicationId,
    );

    if (!sourceStage) {
      return;
    }

    const targetStage = stages.includes(overId as RecruitmentStage)
      ? (overId as RecruitmentStage)
      : findApplicationStage(previousBoard, stages, overId);

    if (!targetStage || sourceStage === targetStage) {
      return;
    }

    /*
     * A rejection reason is retained on the application and may be read months
     * later — by a hiring manager, or by someone answering a candidate. It was
     * collected with `window.prompt`: unlabelled beyond one line, unvalidated,
     * and with no way to tell "cancelled" from "typed nothing". ITEM-0031.
     */
    const rejectionReason =
      targetStage === "REJECTED" && requireRejectReason
        ? await requestValue({
            title: "Reject application",
            description:
              "The reason is kept on the application and can be read later.",
            label: "Rejection reason",
            confirmLabel: "Reject",
          })
        : undefined;

    if (targetStage === "REJECTED" && requireRejectReason) {
      if (!rejectionReason?.trim()) {
        setError(
          "A rejection reason is required before rejecting an application.",
        );
        return;
      }
    }

    const nextBoard = moveApplicationInBoard(
      previousBoard,
      applicationId,
      targetStage,
    );
    setBoard(nextBoard);
    void persistStageChange(
      applicationId,
      targetStage,
      previousBoard,
      rejectionReason?.trim(),
    );
  }

  return (
    <section className="grid gap-4">
      {governedInputDialog}
      {error ? (
        <div className="rounded-[24px] border border-danger/20 bg-danger/5 px-5 py-4 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {isMounted ? (
        <DndContext
          collisionDetection={closestCenter}
          onDragCancel={handleDragCancel}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <BoardColumns
            board={board}
            savingApplicationId={savingApplicationId}
            stages={stages}
            sortable
          />

          <DragOverlay>
            {activeApplication ? (
              <div className="w-[340px] rotate-[1deg] opacity-95">
                <ApplicationCard application={activeApplication} dragging />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <BoardColumns
          board={board}
          savingApplicationId={savingApplicationId}
          stages={stages}
        />
      )}
    </section>
  );
}

function BoardColumns({
  board,
  savingApplicationId,
  sortable = false,
  stages,
}: {
  board: BoardState;
  savingApplicationId: string | null;
  sortable?: boolean;
  stages: RecruitmentStage[];
}) {
  return (
    <div className="max-w-full overflow-x-auto pb-2">
      <div className="flex min-w-max items-start gap-3">
        {stages.map((stage) => (
          <StageColumn
            key={stage}
            applications={board[stage]}
            isSaving={Boolean(
              savingApplicationId &&
                board[stage].some(
                  (application) => application.id === savingApplicationId,
                ),
            )}
            sortable={sortable}
            stage={stage}
          />
        ))}
      </div>
    </div>
  );
}

function StageColumn({
  applications,
  isSaving,
  sortable = false,
  stage,
}: {
  applications: ApplicationItem[];
  isSaving: boolean;
  sortable?: boolean;
  stage: RecruitmentStage;
}) {
  const droppable = useDroppable({
    id: stage,
    disabled: !sortable,
  });

  return (
    <article
      ref={sortable ? droppable.setNodeRef : undefined}
      className={`flex h-[calc(100vh-240px)] w-[340px] max-w-[calc(100vw-2rem)] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface/95 shadow-sm transition ${
        droppable.isOver ? "border-accent/40 ring-2 ring-accent/15" : ""
      }`}
    >
      <div className="sticky top-0 z-10 flex min-w-0 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-4 backdrop-blur">
        <RecruitmentStageBadge stage={stage} />
        <div className="flex items-center gap-2">
          {isSaving ? (
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Saving
            </span>
          ) : null}
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-muted shadow-sm">
            {applications.length}
          </span>
        </div>
      </div>

      {sortable ? (
        <SortableContext
          items={applications.map((application) => application.id)}
          strategy={verticalListSortingStrategy}
        >
          <ApplicationCardList applications={applications} sortable />
        </SortableContext>
      ) : (
        <ApplicationCardList applications={applications} />
      )}
    </article>
  );
}

function ApplicationCardList({
  applications,
  sortable = false,
}: {
  applications: ApplicationItem[];
  sortable?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3">
      {applications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-8 text-center text-sm text-muted">
          Drop applications here
        </div>
      ) : (
        applications.map((application) =>
          sortable ? (
            <SortableApplicationCard
              key={application.id}
              application={application}
            />
          ) : (
            <ApplicationCard key={application.id} application={application} />
          ),
        )
      )}
    </div>
  );
}

function SortableApplicationCard({
  application,
}: {
  application: ApplicationItem;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: application.id,
  });

  return (
    <div
      ref={setNodeRef}
      className="min-w-0"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <ApplicationCard
        application={application}
        attributes={attributes}
        dragging={isDragging}
        listeners={listeners}
      />
    </div>
  );
}

function ApplicationCard({
  application,
  attributes,
  dragging = false,
  listeners,
}: {
  application: ApplicationItem;
  attributes?: DraggableAttributes;
  dragging?: boolean;
  listeners?: SortableListeners;
}) {
  const appliedDate = new Date(application.appliedAt).toLocaleDateString();

  return (
    <article
      className={`group grid min-w-0 gap-4 overflow-hidden rounded-lg border border-border bg-white p-4 shadow-sm transition-all duration-200 ${
        dragging
          ? "scale-[1.01] cursor-grabbing shadow-xl ring-2 ring-accent/20"
          : "hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted transition ${
            dragging
              ? "cursor-grabbing"
              : "cursor-grab hover:border-accent/30 hover:bg-accent-soft/40 hover:text-foreground"
          }`}
          aria-label={`Drag ${application.candidate.fullName}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-1">
          <Link
            className="block truncate text-base font-semibold text-foreground transition hover:text-accent"
            href={`/recruitment/applications/${application.id}`}
          >
            {application.candidate.fullName}
          </Link>
          <p className="truncate text-sm text-muted">
            {application.candidate.email}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-border bg-surface/55 p-3">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Job opening
          </p>
          <Link
            className="block break-words text-sm font-medium text-foreground transition hover:text-accent"
            href={`/recruitment/jobs/${application.jobOpening.id}`}
          >
            {application.jobOpening.title}
          </Link>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Status
          </p>
          <JobOpeningStatusBadge status={application.jobOpening.status} />
        </div>
      </div>

      <div className="grid min-w-0 gap-2 overflow-hidden rounded-lg border border-border bg-white/80 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
          <span className="truncate">Applied</span>
          <span className="whitespace-nowrap font-medium text-foreground">
            {appliedDate}
          </span>
        </div>

        {hasMatchCriteriaConfigured(application.jobOpening.matchCriteria) ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
            <span className="truncate">Match score</span>
            <span className="whitespace-nowrap font-semibold text-foreground">
              {application.matchScore !== null &&
              application.matchScore !== undefined
                ? `${application.matchScore}%`
                : "Unavailable"}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs uppercase tracking-[0.14em] text-muted">
            <span className="truncate">Match score</span>
            <span className="whitespace-nowrap font-semibold text-muted">
              Not configured
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
